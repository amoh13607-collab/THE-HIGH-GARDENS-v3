// src/events/xpGain.js
//
// ============================================================================
// نظام المستويات الجديد — الجزء 1: منح الخبرة عند كل رسالة + إعلان اللفل
// أب القابل للتخصيص الكامل (إيمبد/نص، مع أو بدون صورة، بأي روم تحدده).
// ============================================================================
//
// 📦 التثبيت:
//   1. حط levelingStore.js في: src/utils/levelingStore.js
//   2. حط هذا الملف في: src/events/xpGain.js
//   3. Commit. (يستخدم @napi-rs/canvas المثبتة أصلاً لنظام الترحيب)
//
// تحكم كامل بالإعدادات لاحقاً عبر أمر /levelconfig (ملف منفصل).
// ============================================================================

import { Events, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { getEconomyData, setEconomyData } from '../utils/economy.js';
import { getLevelingConfig, getLevelingState, addXp } from '../utils/levelingStore.js';

const XP_MIN = 15;
const XP_MAX = 25;
const XP_COOLDOWN_MS = 60 * 1000; // دقيقة بين كل منح خبرة لنفس العضو (مضاد سبام)
const EMBED_COLOR = 0x1b5e20;
const GOLD = '#d4af37';

function randomXp() {
  return Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
}

function formatMessage(template, member, level) {
  return String(template).replace(/{user}/g, `${member}`).replace(/{level}/g, String(level)).replace(/{guild}/g, member.guild.name);
}

async function loadAvatarSafely(url) {
  try {
    const res = await fetch(url);
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch (_) {
    return null;
  }
}

async function buildLevelUpImage(member, level) {
  const width = 900;
  const height = 280;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0f2f18');
  grad.addColorStop(1, '#1b5e20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  const avatarSize = 150;
  const ax = 55;
  const ay = height / 2 - avatarSize / 2;
  const avatarImg = await loadAvatarSafely(member.user.displayAvatarURL({ extension: 'png', size: 256 }));

  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  if (avatarImg) {
    ctx.beginPath();
    ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, ax, ay, avatarSize, avatarSize);
  }
  ctx.restore();

  const textX = ax + avatarSize + 45;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText('LEVEL UP!', textX, height / 2 - 15);

  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = GOLD;
  ctx.fillText(`Level ${level}`, textX, height / 2 + 30);

  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(member.user.username, textX, height / 2 + 65);

  return canvas.toBuffer('image/png');
}

export default {
  name: Events.MessageCreate,
  once: false,
  async execute(message) {
    try {
      if (message.author.bot || !message.guild || !message.member) return;

      const client = message.client;
      const guildId = message.guild.id;
      const userId = message.author.id;

      const userData = await getEconomyData(client, guildId, userId);
      const levelState = getLevelingState(userData);

      const now = Date.now();
      if (now - levelState.lastMessageAt < XP_COOLDOWN_MS) return;

      levelState.lastMessageAt = now;
      levelState.totalMessages += 1;
      const leveledUp = addXp(levelState, randomXp());
      await setEconomyData(client, guildId, userId, userData);

      if (!leveledUp) return;

      const config = await getLevelingConfig(client, guildId);
      if (!config.enabled) return;

      const channel = config.channelId ? message.guild.channels.cache.get(config.channelId) : message.channel;
      if (!channel) return;

      const text = formatMessage(config.message, message.member, levelState.level);
      const payload = {};

      if (config.imageEnabled) {
        const imgBuffer = await buildLevelUpImage(message.member, levelState.level);
        payload.files = [new AttachmentBuilder(imgBuffer, { name: 'levelup.png' })];
      }

      if (config.mode === 'text') {
        payload.content = text;
      } else {
        const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(text);
        if (config.imageEnabled) embed.setImage('attachment://levelup.png');
        payload.embeds = [embed];
      }

      await channel.send(payload);
    } catch (err) {
      console.error('[xpGain] خطأ:', err);
    }
  }
};
