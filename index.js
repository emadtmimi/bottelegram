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

// لحفظ أبعاد تغيير الحجم لكل مستخدم
const resizeSettings = {};

// رسالة البداية
bot.start((ctx) =>
  ctx.reply('🤖مرحباً! انا بوت عماد التميمي صممت لخدمتك في تحسين أو تعديل الصور 🖼️\nاكتب /help لعرض الأوامر.')
);

// التلميح للمستخدم إذا أرسل شيئاً غير صورة
bot.on('message', async (ctx, next) => {
  if (ctx.message.text && ctx.message.text.startsWith('/')) {
    return next();
  }
  if (!ctx.message.photo && !ctx.message.document) {
    await ctx.reply('📸 أرسل صورة (كصورة أو كملف) من فضلك.');
  } else {
    await next();
  }
});

// أمر /help
bot.command('help', async (ctx) => {
  await ctx.reply(
    'الأوامر المتاحة:\n' +
    '/start - بدء البوت\n' +
    '/help - المساعدة\n' +
    '/enhance - تحسين جودة الصورة\n' +
    '/resize [العرضxالارتفاع] - تغيير حجم الصورة\n' +
    '/about - عن البوت'
  );
});

// أمر /enhance
bot.command('enhance', async (ctx) => {
  resizeSettings[ctx.from.id] = null; // إلغاء أي إعدادات resize
  await ctx.reply('✨ أرسل الصورة لتحسين جودتها.');
});

// أمر /resize
bot.command('resize', async (ctx) => {
  const args = ctx.message.text.split(' ')[1];
  if (!args || !args.includes('x')) {
    return ctx.reply('❌ صيغة غير صحيحة! استخدم:\n/resize 800x600');
  }
  const [width, height] = args.split('x').map(Number);
  if (isNaN(width) || isNaN(height)) {
    return ctx.reply('❌ الأبعاد يجب أن تكون أرقام صحيحة! مثل:\n/resize 800x600');
  }
  resizeSettings[ctx.from.id] = { width, height };
  await ctx.reply(`✅ تم ضبط الأبعاد على: ${width}x${height}\nالآن أرسل الصورة لتغيير حجمها.`);
});

// أمر /about
bot.command('about', async (ctx) => {
  await ctx.reply('📌 هذا البوت يقوم بتحسين أو تعديل الصور بدقة عالية.\nبرمجة: عماد التميمي @em_mg');
});

// استقبال الصور كـ Photo
bot.on('photo', async (ctx) => {
  try {
    const biggest = ctx.message.photo.pop();
    const file = await ctx.telegram.getFile(biggest.file_id);
    await processAndReply(ctx, file.file_path);
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ حدث خطأ أثناء معالجة الصورة.');
  }
});

// استقبال الصور كـ Document
bot.on('document', async (ctx) => {
  try {
    const doc = ctx.message.document;
    if (!doc.mime_type.startsWith('image/')) {
      return ctx.reply('📂 أرسل ملف صورة فقط (JPEG/PNG).');
    }
    const file = await ctx.telegram.getFile(doc.file_id);
    await processAndReply(ctx, file.file_path);
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ حدث خطأ أثناء معالجة الملف.');
  }
});

async function processAndReply(ctx, telegramFilePath) {
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${telegramFilePath}`;
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error('فشل تنزيل الصورة من تيليجرام');
  const inputBuffer = Buffer.from(await res.arrayBuffer());

  let image = sharp(inputBuffer, { failOnError: false });
  const meta = await image.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;

  if (width * height > 30_000_000) {
    return ctx.reply('⚠️ الصورة كبيرة جداً (أكبر من 30 ميجا بكسل).');
  }

  // إذا كان هناك إعدادات Resize
  if (resizeSettings[ctx.from.id]) {
    const { width, height } = resizeSettings[ctx.from.id];
    image = image.resize(width, height);
    delete resizeSettings[ctx.from.id];
  } else {
    // تحسين الصورة إذا لم يكن هناك Resize
    image = image
      .normalize()
      .median(3)
      .sharpen(1.0);
  }

  const outBuffer = await image
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();

  await ctx.replyWithPhoto({ source: outBuffer }, { caption: '✅ تمت المعالجة بنجاح' });
}

bot.launch().then(() => console.log('🤖 Bot is running...'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
