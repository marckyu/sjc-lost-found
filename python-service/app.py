from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import imagehash
import requests
from io import BytesIO
from urllib.parse import urlparse
from ipaddress import ip_address, ip_network
from concurrent.futures import ThreadPoolExecutor
import socket
import os
import logging

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

Image.MAX_IMAGE_PIXELS = 200_000_000

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 1 * 1024 * 1024

CORS(app, origins=[
    'http://localhost:5173',
    'http://localhost:4173',
    'https://sjc-lost-found.vercel.app',
    os.environ.get('FRONTEND_URL', '')
])

PORT = int(os.environ.get('PORT', 5000))
MATCH_THRESHOLD = float(os.environ.get('MATCH_THRESHOLD', 0.75))
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_IMAGE_DIM = 512

BLOCKED_NETWORKS = [
    ip_network('127.0.0.0/8'),
    ip_network('10.0.0.0/8'),
    ip_network('172.16.0.0/12'),
    ip_network('192.168.0.0/16'),
    ip_network('169.254.0.0/16'),
    ip_network('::1/128'),
    ip_network('fc00::/7'),
    ip_network('fe80::/10'),
]

ALLOWED_SCHEMES = {'http', 'https'}

def is_safe_url(url):
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ALLOWED_SCHEMES:
            return False
        host = parsed.hostname
        if not host:
            return False
        try:
            ip = ip_address(host)
            for net in BLOCKED_NETWORKS:
                if ip in net:
                    return False
        except ValueError:
            pass
        try:
            resolved = socket.gethostbyname(host)
            ip = ip_address(resolved)
            for net in BLOCKED_NETWORKS:
                if ip in net:
                    return False
        except Exception:
            pass
        return True
    except Exception:
        return False

def load_image_from_url(url):
    if not is_safe_url(url):
        logger.warning(f'Blocked unsafe URL: {url}')
        return None
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(
            url,
            timeout=10,
            headers=headers,
            stream=True
        )
        response.raise_for_status()

        content_type = response.headers.get('Content-Type', '')
        if not content_type.startswith('image/'):
            logger.warning(f'Not an image: {content_type} for {url}')
            return None

        content_length = int(response.headers.get('Content-Length', 0))
        if content_length > MAX_IMAGE_BYTES:
            logger.warning(f'Image too large: {content_length} bytes')
            return None

        content = response.content
        if len(content) > MAX_IMAGE_BYTES:
            logger.warning(f'Downloaded image too large: {len(content)} bytes')
            return None

        img = Image.open(BytesIO(content)).convert('RGB')
        img.thumbnail((MAX_IMAGE_DIM, MAX_IMAGE_DIM), Image.LANCZOS)
        return img
    except Exception as e:
        logger.warning(f'load_image_from_url failed: {e}')
        return None

def hash_image(url):
    img = load_image_from_url(url)
    if img is None:
        return None
    try:
        return {
            'phash': imagehash.phash(img),
            'dhash': imagehash.dhash(img),
            'ahash': imagehash.average_hash(img),
        }
    except Exception as e:
        logger.warning(f'hash_image failed: {e}')
        return None

def compare_hashes(h1, h2):
    if h1 is None or h2 is None:
        return 0.0
    try:
        phash_sim = 1 - (h1['phash'] - h2['phash']) / 64
        dhash_sim = 1 - (h1['dhash'] - h2['dhash']) / 64
        ahash_sim = 1 - (h1['ahash'] - h2['ahash']) / 64

        combined = (
            phash_sim * 0.5 +
            dhash_sim * 0.3 +
            ahash_sim * 0.2
        )

        return max(0.0, min(1.0, combined))
    except Exception as e:
        logger.warning(f'compare_hashes failed: {e}')
        return 0.0

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'service': 'image-analysis',
        'version': '1.1.0'
    })

@app.route('/compare', methods=['POST'])
def compare():
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No JSON body provided'}), 400

        urls1 = data.get('urls1', [])
        urls2 = data.get('urls2', [])

        if not urls1 or not urls2:
            return jsonify({
                'similarity': 0.0,
                'matches': 0,
                'total': 0,
                'message': 'Missing image URLs'
            })

        urls1 = urls1[:5]
        urls2 = urls2[:5]

        with ThreadPoolExecutor(max_workers=10) as executor:
            hashes1 = list(executor.map(hash_image, urls1))
            hashes2 = list(executor.map(hash_image, urls2))

        best_similarity = 0.0
        match_count = 0
        total_comparisons = 0

        for h1 in hashes1:
            if h1 is None:
                continue
            for h2 in hashes2:
                if h2 is None:
                    continue
                similarity = compare_hashes(h1, h2)
                total_comparisons += 1

                if similarity > best_similarity:
                    best_similarity = similarity

                if similarity >= MATCH_THRESHOLD:
                    match_count += 1

        return jsonify({
            'similarity': round(best_similarity, 4),
            'matches': match_count,
            'total': total_comparisons,
            'confidence': round(best_similarity * 100, 2)
        })

    except Exception as e:
        logger.error(f'compare endpoint failed: {e}')
        return jsonify({'error': str(e), 'similarity': 0.0}), 500

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'service': 'SJC Image Analysis',
        'version': '1.1.0',
        'endpoints': {
            'health': 'GET /health',
            'compare': 'POST /compare'
        }
    })

if __name__ == '__main__':
    logger.info(f'Starting Image Analysis Service on port {PORT}')
    app.run(host='0.0.0.0', port=PORT, debug=False)