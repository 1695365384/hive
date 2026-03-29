/**
 * 技能意图匹配器
 *
 * 负责将用户输入与技能进行匹配：
 * 1. 从 description 提取触发短语
 * 2. 执行关键词匹配
 * 3. 返回最匹配的技能
 */

import type { Skill, SkillMatchResult } from './types.js';

function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(text: string): string {
  return normalizeText(text).replace(/\s+/g, '');
}

function containsHan(text: string): boolean {
  return /\p{Script=Han}/u.test(text);
}

function buildTokenSet(text: string): Set<string> {
  const normalized = normalizeText(text);
  const compact = compactText(text);
  const tokens = new Set<string>();
  const MAX_BIGRAM_SOURCE_LENGTH = 80;

  for (const token of normalized.split(' ')) {
    if (token) {
      tokens.add(token);
    }
  }

  // 为中文和无空格文本增加字符二元组，提升口语化输入命中率。
  if (compact.length >= 2 && compact.length <= MAX_BIGRAM_SOURCE_LENGTH && containsHan(compact)) {
    for (let i = 0; i < compact.length - 1; i++) {
      tokens.add(compact.slice(i, i + 2));
    }
  }

  return tokens;
}

/**
 * 从技能描述中提取触发短语
 *
 * 触发短语格式：
 * - "This skill should be used when the user asks to \"phrase1\", \"phrase2\"..."
 * - '当用户要求 "短语1"、"短语2" 时使用此技能...'
 *
 * @param description - 技能描述
 * @returns 触发短语数组
 */
export function extractTriggerPhrases(description: string): string[] {
  const phrases: string[] = [];

  // 匹配双引号内的内容
  const doubleQuoteRegex = /"([^"]+)"/g;
  let match;
  while ((match = doubleQuoteRegex.exec(description)) !== null) {
    phrases.push(match[1].toLowerCase());
  }

  // 匹配中文引号内的内容
  const chineseQuoteRegex = /[""]([^""]+)[""]/g;
  while ((match = chineseQuoteRegex.exec(description)) !== null) {
    phrases.push(match[1].toLowerCase());
  }

  // 匹配单引号内的内容（如果存在）
  const singleQuoteRegex = /'([^']+)'/g;
  while ((match = singleQuoteRegex.exec(description)) !== null) {
    phrases.push(match[1].toLowerCase());
  }

  // 去重
  return [...new Set(phrases)];
}

/**
 * 计算两个字符串的相似度（Jaccard 相似度）
 *
 * @param str1 - 字符串1
 * @param str2 - 字符串2
 * @returns 相似度 0-1
 */
function calculateSimilarity(str1: string, str2: string): number {
  const tokens1 = buildTokenSet(str1);
  const tokens2 = buildTokenSet(str2);

  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0;
  }

  const intersection = [...tokens1].filter((token) => tokens2.has(token)).length;
  return (2 * intersection) / (tokens1.size + tokens2.size);
}

function calculateCoverage(input: string, phrase: string): number {
  const inputTokens = buildTokenSet(input);
  const phraseTokens = buildTokenSet(phrase);
  if (phraseTokens.size === 0) {
    return 0;
  }

  const hit = [...phraseTokens].filter((token) => inputTokens.has(token)).length;
  return hit / phraseTokens.size;
}

function calculateMatchScore(userInput: string, triggerPhrase: string): number {
  const normalizedInput = normalizeText(userInput);
  const normalizedPhrase = normalizeText(triggerPhrase);
  const compactInput = compactText(userInput);
  const compactPhrase = compactText(triggerPhrase);

  if (!normalizedInput || !normalizedPhrase) {
    return 0;
  }

  // 优先处理精确子串命中（包括中文无空格场景）
  if (normalizedInput.includes(normalizedPhrase) || compactInput.includes(compactPhrase)) {
    return 1;
  }

  const similarity = calculateSimilarity(userInput, triggerPhrase);
  const coverage = calculateCoverage(userInput, triggerPhrase);
  return Math.max(similarity, coverage * 0.9);
}

/**
 * 检查用户输入是否匹配触发短语
 *
 * 匹配规则：
 * 1. 精确包含：用户输入包含完整的触发短语
 * 2. 模糊匹配：相似度高于阈值
 *
 * @param userInput - 用户输入
 * @param triggerPhrase - 触发短语
 * @param fuzzyThreshold - 模糊匹配阈值（默认 0.8）
 * @returns 是否匹配
 */
function getPhraseMatchScore(
  userInput: string,
  triggerPhrase: string,
  fuzzyThreshold = 0.8
): number {
  const score = calculateMatchScore(userInput, triggerPhrase);
  const compactPhrase = compactText(triggerPhrase);
  const shortPhrase = compactPhrase.length <= 6;
  const adjustedThreshold = shortPhrase ? Math.max(0.6, fuzzyThreshold - 0.15) : fuzzyThreshold;

  return score >= adjustedThreshold ? score : -1;
}

/**
 * 缓存最大条目数
 * 防止长时间运行导致的内存泄漏
 */
const MAX_CACHE_SIZE = 100;

/**
 * 技能匹配器类
 */
export class SkillMatcher {
  private triggerPhrasesCache: Map<string, string[]> = new Map();
  private fuzzyThreshold: number;

  constructor(fuzzyThreshold = 0.8) {
    this.fuzzyThreshold = fuzzyThreshold;
  }

  /**
   * 获取技能的触发短语（带缓存）
   * 使用 LRU 策略限制缓存大小
   */
  private getTriggerPhrases(skill: Skill): string[] {
    const cacheKey = skill.path;

    if (this.triggerPhrasesCache.has(cacheKey)) {
      // LRU: 将已存在的条目移到最后（删除后重新添加）
      const phrases = this.triggerPhrasesCache.get(cacheKey)!;
      this.triggerPhrasesCache.delete(cacheKey);
      this.triggerPhrasesCache.set(cacheKey, phrases);
      return phrases;
    }

    // 缓存未命中，提取触发短语
    const phrases = extractTriggerPhrases(skill.metadata.description);

    // LRU 淘汰：如果缓存已满，删除最旧的条目
    if (this.triggerPhrasesCache.size >= MAX_CACHE_SIZE) {
      // Map 的 keys() 迭代器按插入顺序返回，第一个是最旧的
      const oldestKey = this.triggerPhrasesCache.keys().next().value;
      if (oldestKey) {
        this.triggerPhrasesCache.delete(oldestKey);
      }
    }

    this.triggerPhrasesCache.set(cacheKey, phrases);
    return phrases;
  }

  /**
   * 匹配单个技能
   *
   * @param userInput - 用户输入
   * @param skill - 技能对象
   * @returns 匹配结果，如果不匹配则返回 null
   */
  matchSingle(userInput: string, skill: Skill): SkillMatchResult | null {
    const phrases = this.getTriggerPhrases(skill);
    let bestIndex = -1;
    let bestScore = -1;

    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      const score = getPhraseMatchScore(userInput, phrase, this.fuzzyThreshold);
      if (score >= 0 && score > bestScore) {
        bestScore = score;
        bestIndex = i;

        if (score === 1) {
          break;
        }
      }
    }

    if (bestIndex === -1) {
      return null;
    }

    return {
      skill,
      matchedPhrase: phrases[bestIndex],
      matchIndex: bestIndex,
    };
  }

  /**
   * 从多个技能中匹配最佳结果
   *
   * @param userInput - 用户输入
   * @param skills - 技能数组
   * @returns 最佳匹配结果，如果没有匹配则返回 null
   */
  matchBest(userInput: string, skills: Skill[]): SkillMatchResult | null {
    let bestMatch: SkillMatchResult | null = null;
    let bestScore = -1;

    for (const skill of skills) {
      const result = this.matchSingle(userInput, skill);
      if (result) {
        // 计算匹配分数：更早的触发短语得分更高
        const score = 100 - result.matchIndex;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = result;
        }
      }
    }

    return bestMatch;
  }

  /**
   * 匹配所有符合条件的技能
   *
   * @param userInput - 用户输入
   * @param skills - 技能数组
   * @returns 所有匹配结果
   */
  matchAll(userInput: string, skills: Skill[]): SkillMatchResult[] {
    const results: SkillMatchResult[] = [];

    for (const skill of skills) {
      const result = this.matchSingle(userInput, skill);
      if (result) {
        results.push(result);
      }
    }

    // 按匹配位置排序
    results.sort((a, b) => a.matchIndex - b.matchIndex);

    return results;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.triggerPhrasesCache.clear();
  }
}

/**
 * 创建技能匹配器
 */
export function createSkillMatcher(fuzzyThreshold?: number): SkillMatcher {
  return new SkillMatcher(fuzzyThreshold);
}
