// src/commands/Leveling/rank.js
//
// ============================================================================
// نظام المستويات الجديد — الجزء 2: أمر /rank يعرض بطاقة مستوى مصممة
// (صورة أفاتار + شريط تقدم خبرة) تماماً بأسلوب البوتات الكبيرة.
// ============================================================================

import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { getEconomyData } from '../../utils/economy.js';
import { getLevelingState, xpForLevel } from '../../utils/levelingStore.js';

const EMBED_COLOR = 0x1b5e20;
const GOLD = '#d4af37';

async function loadAvatarSafely(url) {
  try {
    const res = await fetch(url);
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch (_) {
    return null;
  }
}

async function buildRankCard(member, levelState) {
  const width = 934;
  const height = 282;
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

  const avatarSize = 180;
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

  const textX = ax + avatarSize + 40;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(member.user.username, textX, 90);

  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = GOLD;
  ctx.fillText(`LEVEL ${levelState.level}`, textX, 135);

  const threshold = xpForLevel(levelState.level);
  const barWidth = width - textX - 60;
  const barX = textX;
  const barY = 165;
  const barHeight = 28;

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  const progress = Math.max(0, Math.min(1, levelState.xp / threshold));
  ctx.fillStyle = GOLD;
  ctx.fillRect(barX, barY, barWidth * progress, barHeight);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${levelState.xp} / ${threshold} XP`, barX + barWidth, barY + barHeight + 26);

  return canvas.toBuffer('image/png');
}

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('عرض مستواك الحالي وتقدمك')
    .addUserOption((o) => o.setName('member').setDescription('عضو آخر (اختياري)').setRequired(false)),

  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser('member') || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id);
      const userData = await getEconomyData(interaction.client, interaction.guildId, targetUser.id);
      const levelState = getLevelingState(userData);

      const imgBuffer = await buildRankCard(member, levelState);
      const attachment = new AttachmentBuilder(imgBuffer, { name: 'rank.png' });
      const embed = new EmbedBuilder().setColor(EMBED_COLOR).setImage('attachment://rank.png');

      await interaction.reply({ embeds: [embed], files: [attachment] });
    } catch (error) {
      const msg = error?.userMessage || error?.message || 'حدث خطأ غير متوقع.';
      await interaction.reply({ content: `❌ ${msg}`, ephemeral: true });
    }
  }
};
