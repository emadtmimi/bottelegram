import 'dotenv/config';
import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
import sharp from 'sharp';

const BOT_TOKEN = process.env.BOT_TOKEN || 'PUT_YOUR_TOKEN_HERE';
if (!BOT_TOKEN || BOT_TOKEN === 'PUT_YOUR_TOKEN_HERE') {
  console.error('❌ ضع توكن البوت في BOT_TOKEN (env).');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// رسالة البداية
bot.start((ctx) =>
  ctx.reply('مرحباً! انا بوت عماد التميمي صممت لخدمتك في تحسين الصور ارسل لي الصورة الان  🔧🖼️'));

// التلميح للمستخدم إذا أرسل شيئاً غير صورة
bot.on('message', async (ctx, next) => {
  // السماح بالأوامر أولاً
  if (ctx.message.text && ctx.message.text.startsWith('/')) {
    return next(); // تمرير الأمر للمعالجة العادية
  }

  // إذا لم تكن صورة أو ملف
  if (!ctx.message.photo && !ctx.message.document) {
    await ctx.reply('أرسل صورة (كصورة أو كملف) من فضلك 🙂');
  } else {
    await next();
  }
});
// أمر /help - تعليمات البوت
bot.command('help', async (ctx) => {
  await ctx.reply('الأوامر المتاحة:\n/start - بدء البوت\n/help - المساعدة\n/enhance - تحسين جودة الصورة');
});
// أمر /enhance - لتحسين جودة الصورة
bot.command('enhance', async (ctx) => {
  await ctx.reply('أرسل الصورة لتحسين جودتها.');
});
// أمر /about - لتحسين جودة الصورة
bot.command('about', async (ctx) => {
  await ctx.reply('هذا البوت يقوم بتحسين الصور  بدقة عالية تم برمجة هذا البوت بواسطة عماد التميمي  @em_mg');
});
// التقط الصور المرسلة كـ Photo (يضغطها تيليجرام)
bot.on('photo', async (ctx) => {
  try {
    const photoSizes = ctx.message.photo;
    const biggest = photoSizes[photoSizes.length - 1]; // أعلى دقة
    const file = await ctx.telegram.getFile(biggest.file_id);

    await processAndReply(ctx, file.file_path);
  } catch (err) {
    console.error(err);
    await ctx.reply('حدث خطأ أثناء معالجة الصورة. جرّب مرة أخرى 🙏');
  }
});

// التقط الصور المرسلة كـ Document (أفضل للحفاظ على الجودة الأصلية)
bot.on('document', async (ctx) => {
  try {
    const doc = ctx.message.document;
    const isImage =
      doc.mime_type && doc.mime_type.startsWith('image/');
    if (!isImage) {
      return ctx.reply('أرسل ملف صورة فقط من فضلك (JPEG/PNG).');
    }
    const file = await ctx.telegram.getFile(doc.file_id);
    await processAndReply(ctx, file.file_path);
  } catch (err) {
    console.error(err);
    await ctx.reply('حدث خطأ أثناء معالجة الملف. جرّب مرة أخرى 🙏');
  }
});

async function processAndReply(ctx, telegramFilePath) {
  // تنزيل الصورة من خوادم تيليجرام
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${telegramFilePath}`;
  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error('فشل تنزيل الصورة من تيليجرام');
  }
  const inputBuffer = Buffer.from(await res.arrayBuffer());

  // معالجات تحسين (سريعة وخفيفة بدون ذكاء اصطناعي):
  // 1) normalize لتوازن الألوان، 2) median(3) لإزالة ضوضاء بسيطة،
  // 3) sharpen للحدة، 4) تكبير ×2 مع Lanczos3، 5) تصدير JPEG بجودة عالية
  const image = sharp(inputBuffer, { failOnError: false });

  // قراءة الميتاداتا لتحديد أبعاد الأصل
  const meta = await image.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  // منع صور ضخمة جداً (اختياري)
  if (width * height > 30_000_000) {
    await ctx.reply('الصورة كبيرة جداً. رجاءً أرسل صورة أصغر من 30 ميجا بكسل 🙏');
    return;
  }

  // المعالجة
  const scale = 2; // تكبير ×2 — يمكن تغييره إلى 3 أو 4 حسب الرغبة
  const outBuffer = await sharp(inputBuffer, { failOnError: false })
    .rotate()               // إصلاح اتجاه الصورة حسب EXIF
    .normalize()            // توازن إضاءة وتشبع تلقائي
    .median(3)              // إزالة ضوضاء خفيفة
    .sharpen(1.0)           // زيادة حدة خفيفة (amount=1.0)
    .jpeg({
      quality: 92,          // جودة عالية
      chromaSubsampling: '4:4:4',
      mozjpeg: true
    })
    .toBuffer();

  // إرسال النتيجة للمستخدم
  await ctx.replyWithPhoto({ source: outBuffer }, { caption: '✅ تمت المعالجة: تحسين الصورة بنجاح' });
}

// تشغيل البوت (polling)
bot.launch().then(() => {
  console.log('🤖 Bot is running...');
});

// إيقاف نظيف عند Signals (مهم لمنصات الاستضافة)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
