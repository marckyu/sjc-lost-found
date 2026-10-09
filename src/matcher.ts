import { getAllItems, saveMatch, sendNotification } from './db';
import { findMatches, MATCH_THRESHOLD, type MatchResult } from './matching';
import type { Item } from './types';

const PYTHON_SERVICE_URL = 'http://localhost:5000';

function buildReason(result: MatchResult, imageScore?: number): string {
    const parts: string[] = [];
    if (result.breakdown.category > 0) parts.push('Same category');
    if (result.breakdown.location >= 15) parts.push('Similar location');
    if (result.breakdown.name >= 18) parts.push('Similar item name');
    if (result.breakdown.description >= 10) parts.push('Similar description');
    if (result.breakdown.date >= 7) parts.push('Close dates');
    if (imageScore !== undefined && imageScore >= 0.75) {
        parts.push(`Similar images (${Math.round(imageScore * 100)}%)`);
    }
    return parts.join(' • ') || 'Potential match';
}

interface ImageCompareResponse {
    similarity: number;
    matches: number;
    total: number;
    confidence: number;
}

async function compareItemImages(item1: Item, item2: Item): Promise<number> {
    const urls1 = item1.fullImageUrls || item1.imageUrls || [];
    const urls2 = item2.fullImageUrls || item2.imageUrls || [];

    if (urls1.length === 0 || urls2.length === 0) {
        return 0;
    }

    try {
        const response = await fetch(`${PYTHON_SERVICE_URL}/compare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urls1: urls1.slice(0, 5),
                urls2: urls2.slice(0, 5)
            })
        });

        if (!response.ok) {
            console.error('[matcher] Image service returned', response.status);
            return 0;
        }

        const data: ImageCompareResponse = await response.json();
        return data.similarity || 0;
    } catch (err) {
        console.warn('[matcher] Image comparison failed (Python service offline?):', err);
        return 0;
    }
}

export interface MatchCandidate {
    lostItem: Item;
    foundItem: Item;
    score: number;
    breakdown: MatchResult['breakdown'];
    reason: string;
    imageScore?: number;
}

export async function runMatching(
    triggerItem?: Item,
    options: { notify?: boolean } = { notify: true }
): Promise<MatchCandidate[]> {
    try {
        const allItems = await getAllItems();
        const results = findMatches(allItems);

        if (results.length === 0) return [];

        const relevant = triggerItem
            ? results.filter(
                  r =>
                      r.lostItem.id === triggerItem.id ||
                      r.foundItem.id === triggerItem.id
              )
            : results;

        const candidates: MatchCandidate[] = [];

        for (const r of relevant) {
            let imageScore = 0;
            try {
                imageScore = await compareItemImages(r.lostItem, r.foundItem);
            } catch (imgErr) {
                console.warn('[matcher] Image scoring skipped:', imgErr);
            }

            const imageBoost = Math.round(imageScore * 15);
            const finalScore = Math.min(100, r.score + imageBoost);

            const reason = buildReason(r, imageScore);

            await saveMatch(
                r.lostItem.id,
                r.foundItem.id,
                finalScore,
                reason
            );

            candidates.push({
                lostItem: r.lostItem,
                foundItem: r.foundItem,
                score: finalScore,
                breakdown: r.breakdown,
                reason,
                imageScore
            });

            if (options.notify) {
                const message =
                    `Potential match found! "${r.foundItem.itemName}" (${finalScore}% confidence). ` +
                    `Check your items to view the match.`;

                const recipientId =
                    triggerItem?.id === r.lostItem.id
                        ? r.foundItem.userId
                        : r.lostItem.userId;

                try {
                    await sendNotification(
                        recipientId,
                        r.foundItem.id,
                        message
                    );
                } catch (err) {
                    console.error('[matcher] notification failed:', err);
                }
            }
        }

        console.log(
            `[matcher] ${candidates.length} match(es) found for ${triggerItem?.itemName ?? 'all items'}`
        );

        return candidates;
    } catch (err) {
        console.error('[matcher] runMatching failed:', err);
        return [];
    }
}

export { MATCH_THRESHOLD };