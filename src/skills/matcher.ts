/**
 * 技能意图匹配器
 *
 * 负责将用户输入与技能进行匹配：
 * 1. 从 description 提取触发短语
 * 2. 执行关键词匹配
 * 3. 返回最匹配的技能
 */

import type { Skill, SkillMatchResult } from './types.js';

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
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
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
function isPhraseMatched(
  userInput: string,
  triggerPhrase: string,
  fuzzyThreshold = 0.8
): boolean {
  const inputLower = userInput.toLowerCase();
  const phraseLower = triggerPhrase.toLowerCase();

  // 1. 精确包含匹配
  if (inputLower.includes(phraseLower)) {
    return true;
  }

  // 2. 对于较短的触发短语，使用模糊匹配
  if (phraseLower.split(/\s+/).length <= 3) {
    const words = inputLower.split(/\s+/);
    for (const word of words) {
      if (calculateSimilarity(word, phraseLower) >= fuzzyThreshold) {
        return true;
      }
    }
  }

  return false;
}

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
   */
  private getTriggerPhrases(skill: Skill): string[] {
    const cacheKey = skill.path;

    if (!this.triggerPhrasesCache.has(cacheKey)) {
      const phrases = extractTriggerPhrases(skill.metadata.description);
      this.triggerPhrasesCache.set(cacheKey, phrases);
    }

    return this.triggerPhrasesCache.get(cacheKey)!;
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

    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      if (isPhraseMatched(userInput, phrase, this.fuzzyThreshold)) {
        return {
          skill,
          matchedPhrase: phrase,
          matchIndex: i,
        };
      }
    }

    return null;
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
