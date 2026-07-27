// src/utils/levelingStore.js
//
// ============================================================================
// طبقة تخزين مشتركة لنظام المستويات الجديد. تُبنى فوق نفس getEconomyData/
// setEconomyData الموثوقة المستخدمة أصلاً بنظام الإيكونومي والمزرعة — ما
// فيه أي نظام تخزين جديد مجهول، فتضمن إنها تشتغل من أول مرة.
//
// - بيانات كل عضو (XP/المستوى) تُخزّن تحت userData.leveling
// - إعدادات كل سيرفر (شكل رسالة اللفل أب، الروم، الصورة...) تُخزّن بسجل
//   وهمي خاص بالسيرفر عبر معرّف مستخدم محجوز (__leveling_config__)
// ============================================================================

import { getEconomyData, setEconomyData } from './economy.js';

const CONFIG_PSEUDO_USER_ID = '__leveling_config__';

export const DEFAULT_LEVELING_CONFIG = {
  enabled: true,
  mode: 'embed', // 'embed' أو 'text'
  imageEnabled: true,
  channelId: null, // null = نفس الروم اللي كتب فيه العضو
  message: '🎉 مبروك {user}! وصلت للمستوى **{level}**!'
};

// عتبة الخبرة المطلوبة للانتقال من مستوى لآخر (منحنى تصاعدي معياري)
export function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

export async function getLevelingConfig(client, guildId) {
  const data = await getEconomyData(client, guildId, CONFIG_PSEUDO_USER_ID);
  if (!data.levelingConfig || typeof data.levelingConfig !== 'object') {
    data.levelingConfig = { ...DEFAULT_LEVELING_CONFIG };
    await setEconomyData(client, guildId, CONFIG_PSEUDO_USER_ID, data);
  }
  return { ...DEFAULT_LEVELING_CONFIG, ...data.levelingConfig };
}

export async function setLevelingConfig(client, guildId, partial) {
  const data = await getEconomyData(client, guildId, CONFIG_PSEUDO_USER_ID);
  data.levelingConfig = { ...DEFAULT_LEVELING_CONFIG, ...(data.levelingConfig || {}), ...partial };
  await setEconomyData(client, guildId, CONFIG_PSEUDO_USER_ID, data);
  return data.levelingConfig;
}

export function getLevelingState(userData) {
  if (!userData.leveling || typeof userData.leveling !== 'object') {
    userData.leveling = { xp: 0, level: 0, lastMessageAt: 0, totalMessages: 0 };
  }
  const l = userData.leveling;
  if (!Number.isFinite(l.xp)) l.xp = 0;
  if (!Number.isFinite(l.level)) l.level = 0;
  if (!Number.isFinite(l.lastMessageAt)) l.lastMessageAt = 0;
  if (!Number.isFinite(l.totalMessages)) l.totalMessages = 0;
  return l;
}

export function addXp(levelState, amount) {
  levelState.xp += amount;
  let leveledUp = false;
  let threshold = xpForLevel(levelState.level);
  while (levelState.xp >= threshold) {
    levelState.xp -= threshold;
    levelState.level += 1;
    leveledUp = true;
    threshold = xpForLevel(levelState.level);
  }
  return leveledUp;
}

// إجمالي الخبرة المتراكمة عبر كل المستويات (تُستخدم بترتيب الليدربورد)
export function totalAccumulatedXp(levelState) {
  let total = levelState.xp;
  for (let lvl = 0; lvl < levelState.level; lvl++) total += xpForLevel(lvl);
  return total;
}
