// src/events/farewellMemberRemove.js
//
// ============================================================================
// نظام وداع جديد (مستقل تماماً، مرافق لنظام الترحيب) — عند مغادرة عضو:
// يولّد صورة بانر داكنة (صورة العضو بتدرج رمادي + إطار أحمر باهت) + إيمبد.
// ============================================================================
//
// نفس تثبيت نظام الترحيب بالضبط:
//   npm install @napi-rs/canvas   (لو ما ثبتها قبل)
//   حط الملف في: src/events/farewellMemberRemove.js
//   غيّر WELCOME_CHANNEL_ID تحت (تقدر تخليه نفس روم الترحيب أو روم ثاني)
// ============================================================================

import { Events, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const EMBED_COLOR = 0x7a1f1f;
const RED = '#8a3a3a';

// 🔧 غيّر هذا لآيدي الروم (يقدر يكون نفس روم الترحيب)
const WELCOME_CHANNEL_ID = '1529561420914491427';

async function loadAvatarSafely(url) {
  try {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    return await loadImage(buf);
  } catch (_) {
    return null;
  }
}

// تحويل منطقة من الكانفاس لتدرج رمادي يدوياً (بدون الاعتماد على ctx.filter
// لأنه غير مدعوم بشكل موثوق بكل بيئات @napi-rs/canvas)
function desaturateRegion(ctx, x, y, w, h) {
  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const avg = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
    data[i] = avg;
    data[i + 1] = avg;
    data[i + 2] = avg;
  }
  ctx.putImageData(imageData, x, y);
}

async function buildFarewellImage(member) {
  const width = 1024;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#1a1a1a');
  grad.addColorStop(1, '#3a1414');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = RED;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  const avatarSize = 180;
  const ax = width / 2 - avatarSize / 2;
  const ay = 55;
  const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const avatarImg = await loadAvatarSafely(avatarURL);

  ctx.save();
  ctx.beginPath();
  ctx.arc(width / 2, ay + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = RED;
  ctx.fill();
  if (avatarImg) {
    ctx.beginPath();
    ctx.arc(width / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, ax, ay, avatarSize, avatarSize);
  }
  ctx.restore();

  if (avatarImg) {
    try {
      desaturateRegion(ctx, ax, ay, avatarSize, avatarSize);
    } catch (_) {
      /* لو فشل تحويل الرمادي لأي سبب، نكمل بالصورة الملونة بدون كراش */
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#eeeeee';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText('GOODBYE', width / 2, ay + avatarSize + 70);

  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#c98a8a';
  ctx.fillText(member.user.username, width / 2, ay + avatarSize + 108);

  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Now ${member.guild.memberCount} members`, width / 2, ay + avatarSize + 140);

  return canvas.toBuffer('image/png');
}

export default {
  name: Events.GuildMemberRemove,
  once: false,
  async execute(member) {
    try {
      const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID) || member.guild.systemChannel;
      if (!channel) return;

      const imageBuffer = await buildFarewellImage(member);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'farewell.png' });

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('👋 عضو غادر السيرفر')
        .setDescription(`وداعاً **${member.user.tag}**، نتمنى نشوفك مرة ثانية 🌿`)
        .setImage('attachment://farewell.png')
        .setTimestamp();

      await channel.send({ embeds: [embed], files: [attachment] });
    } catch (err) {
      console.error('[farewellMemberRemove] فشل إرسال رسالة الوداع:', err);
    }
  }
};
