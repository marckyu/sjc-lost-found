from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import imagehash
import requests
from io import BytesIO
import os

Image.MAX_IMAGE_PIXELS = 200_000_000

app = Flask(__name__)
CORS(app)

PORT = int(os.environ.get('PORT', 5000))

def load_image_from_url(url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, timeout=10, headers=headers)
        response.raise_for_status()
        return Image.open(BytesIO(response.content)).convert('RGB')
    except Exception as e:
        return None

def compare_images(img1, img2):
    if img1 is None or img2 is None:
        return 0.0

    try:
        hash1_phash = imagehash.phash(img1)
        hash2_phash = imagehash.phash(img2)
        hash1_dhash = imagehash.dhash(img1)
        hash2_dhash = imagehash.dhash(img2)
        hash1_ahash = imagehash.average_hash(img1)
        hash2_ahash = imagehash.average_hash(img2)

        phash_similarity = 1 - (hash1_phash - hash2_phash) / 64
        dhash_similarity = 1 - (hash1_dhash - hash2_dhash) / 64
        ahash_similarity = 1 - (hash1_ahash - hash2_ahash) / 64

        combined = (phash_similarity * 0.5) + (dhash_similarity * 0.3) + (ahash_similarity * 0.2)

        return max(0.0, min(1.0, combined))
    except Exception as e:
        return 0.0

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'image-analysis'})

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

        best_similarity = 0.0
        match_count = 0
        total_comparisons = 0

        for url1 in urls1[:5]:
            img1 = load_image_from_url(url1)
            if img1 is None:
                continue

            for url2 in urls2[:5]:
                img2 = load_image_from_url(url2)
                if img2 is None:
                    continue

                similarity = compare_images(img1, img2)
                total_comparisons += 1

                if similarity > best_similarity:
                    best_similarity = similarity

                if similarity >= 0.75:
                    match_count += 1

        return jsonify({
            'similarity': round(best_similarity, 4),
            'matches': match_count,
            'total': total_comparisons,
            'confidence': round(best_similarity * 100, 2)
        })

    except Exception as e:
        return jsonify({'error': str(e), 'similarity': 0.0}), 500

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        'service': 'SJC Image Analysis',
        'version': '1.0.0',
        'endpoints': {
            'health': 'GET /health',
            'compare': 'POST /compare'
        }
    })

if __name__ == '__main__':
    print(f'Starting Image Analysis Service on port {PORT}')
    app.run(host='0.0.0.0', port=PORT, debug=False)