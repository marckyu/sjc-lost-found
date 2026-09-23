import type { Item } from './types';

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'this', 'that', 'these', 'those', 'it', 'its', 'i', 'you', 'he', 'she',
    'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their',
    'ko', 'mo', 'ni', 'si', 'ang', 'ng', 'sa', 'na', 'ay', 'mga', 'yung', 'ung'
]);

export function tokenize(text: string): string[] {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

export function cosineSimilarity(a: string, b: string): number {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);

    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    const freqA: Record<string, number> = {};
    const freqB: Record<string, number> = {};

    for (const t of tokensA) freqA[t] = (freqA[t] || 0) + 1;
    for (const t of tokensB) freqB[t] = (freqB[t] || 0) + 1;

    const allTokens = new Set([...tokensA, ...tokensB]);

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (const t of allTokens) {
        const fa = freqA[t] || 0;
        const fb = freqB[t] || 0;
        dot += fa * fb;
        magA += fa * fa;
        magB += fb * fb;
    }

    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(tokenize(a));
    const setB = new Set(tokenize(b));

    if (setA.size === 0 && setB.size === 0) return 0;

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
}

export function levenshteinSimilarity(a: string, b: string): number {
    const s1 = a.toLowerCase().trim();
    const s2 = b.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= s1.length; i++) matrix[i] = [i];
    for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= s1.length; i++) {
        for (let j = 1; j <= s2.length; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    const distance = matrix[s1.length][s2.length];
    const maxLen = Math.max(s1.length, s2.length);

    return 1 - distance / maxLen;
}

export function dateProximityScore(dateA: Date | null, dateB: Date | null): number {
    if (!dateA || !dateB) return 0;

    const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 1) return 1;
    if (diffDays <= 3) return 0.8;
    if (diffDays <= 7) return 0.6;
    if (diffDays <= 14) return 0.4;
    if (diffDays <= 30) return 0.2;
    return 0;
}

export interface MatchBreakdown {
    category: number;
    location: number;
    name: number;
    description: number;
    date: number;
}

export interface MatchResult {
    lostItem: Item;
    foundItem: Item;
    score: number;
    breakdown: MatchBreakdown;
}

const WEIGHTS = {
    category: 30,
    location: 20,
    name: 25,
    description: 15,
    date: 10
};

export const MATCH_THRESHOLD = 60;

export function computeMatchScore(lost: Item, found: Item): MatchResult {
    const categoryScore = lost.category === found.category ? 1 : 0;
    const locationScore = jaccardSimilarity(lost.location ?? '', found.location ?? '');
    const nameScore = Math.max(
        cosineSimilarity(lost.itemName ?? '', found.itemName ?? ''),
        levenshteinSimilarity(lost.itemName ?? '', found.itemName ?? '')
    );
    const descriptionScore = cosineSimilarity(lost.description ?? '', found.description ?? '');
    const dateScore = dateProximityScore(lost.date, found.date);

    const breakdown: MatchBreakdown = {
        category: Math.round(categoryScore * WEIGHTS.category),
        location: Math.round(locationScore * WEIGHTS.location),
        name: Math.round(nameScore * WEIGHTS.name),
        description: Math.round(descriptionScore * WEIGHTS.description),
        date: Math.round(dateScore * WEIGHTS.date)
    };

    const score =
        breakdown.category +
        breakdown.location +
        breakdown.name +
        breakdown.description +
        breakdown.date;

    return { lostItem: lost, foundItem: found, score, breakdown };
}

export function findMatches(items: Item[]): MatchResult[] {
    const lostItems = items.filter(i => i.status === 'lost' && !i.recovered);
    const foundItems = items.filter(i => i.status === 'found' && !i.recovered);

    const matches: MatchResult[] = [];

    for (const lost of lostItems) {
        for (const found of foundItems) {
            const result = computeMatchScore(lost, found);
            if (result.score >= MATCH_THRESHOLD) {
                matches.push(result);
            }
        }
    }

    return matches.sort((a, b) => b.score - a.score);
}