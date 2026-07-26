// src/events/welcomeMemberAdd.js
//
// ============================================================================
// نظام ترحيب جديد بالكامل (مستقل، ما له علاقة بأي نظام قديم) — عند انضمام
// عضو جديد: يولّد صورة بانر مخصصة (صورة العضو + إطار مزخرف) + إيمبد غني،
// ويرسلهم في روم الترحيب.
// ============================================================================
//
// 📦 التثبيت:
//   1. ثبّت مكتبة الرسم (لا تحتاج أي أدوات بناء/كومبايل، تعمل فوراً على Railway):
//        npm install @napi-rs/canvas
//   2. حط هذا الملف في: src/events/welcomeMemberAdd.js
//   3. غيّر قيمة WELCOME_CHANNEL_ID تحت لآيدي روم الترحيب عندك (رجّة يمين
//      على الروم بالديسكورد → Copy Channel ID، يحتاج Developer Mode مفعّل).
//   4. اعمل Commit → Railway يعيد النشر تلقائياً.
//
// ⚠️ ملاحظة مهمة: نظام تحميل الأحداث (events loader) قد يتوقع شكل تصدير
// مختلف قليلاً عن الموجود هنا. استخدمت الصيغة القياسية لـ discord.js v14
// (name + execute). إذا ما اشتغل الحدث عند انضمام عضو تجريبي، ابعثلي أي
// ملف حدث موجود عندك بمجلد src/events وبعدّل التصدير خلال دقائق.
// ============================================================================

import { Events, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const EMBED_COLOR = 0x1b5e20;
const GOLD = '#d4af37';

// 🔧 غيّر هذا لآيدي روم الترحيب عندك
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

async function buildWelcomeImage(member) {
  const width = 1024;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // خلفية متدرجة
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0f2f18');
  grad.addColorStop(1, '#1b5e20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // خطوط زخرفية قطرية شفافة
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  for (let x = -height; x < width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }

  // إطار ذهبي
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  // الأفاتار (دائري، بإطار ذهبي)
  const avatarSize = 180;
  const ax = width / 2 - avatarSize / 2;
  const ay = 55;
  const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const avatarImg = await loadAvatarSafely(avatarURL);

  ctx.save();
  ctx.beginPath();
  ctx.arc(width / 2, ay + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
  ctx.fillStyle = GOLD;
  ctx.fill();
  if (avatarImg) {
    ctx.beginPath();
    ctx.arc(width / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, ax, ay, avatarSize, avatarSize);
  }
  ctx.restore();

  // نصوص البانر (إنجليزي/أرقام فقط لضمان عرض صحيح دائماً بأي اسم مستخدم)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText('WELCOME', width / 2, ay + avatarSize + 70);

  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = GOLD;
  ctx.fillText(member.user.username, width / 2, ay + avatarSize + 110);

  ctx.font = '22px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`Member #${member.guild.memberCount}`, width / 2, ay + avatarSize + 145);

  return canvas.toBuffer('image/png');
}

export default {
  name: Events.GuildMemberAdd,
  once: false,
  async execute(member) {
    try {
      const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID) || member.guild.systemChannel;
      if (!channel) return;

      const imageBuffer = await buildWelcomeImage(member);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });

      const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);

      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('🎉 عضو جديد انضم لنا!')
        .setDescription(
          `أهلاً وسهلاً ${member} في **${member.guild.name}**! 🌿\n` +
            'نتمنى لك وقتاً ممتعاً بيننا، لا تنسَ تقرأ قوانين السيرفر وتتعرف على بقية الأعضاء.'
        )
        .addFields(
          { name: '👤 العضو', value: `${member.user.tag}`, inline: true },
          { name: '🔢 الترتيب', value: `العضو رقم ${member.guild.memberCount}`, inline: true },
          { name: '📅 عمر الحساب', value: `${accountAgeDays} يوم`, inline: true }
        )
        .setImage('attachment://welcome.png')
        .setTimestamp();

      await channel.send({ embeds: [embed], files: [attachment] });
    } catch (err) {
      console.error('[welcomeMemberAdd] فشل إرسال رسالة الترحيب:', err);
    }
  }
};
  
