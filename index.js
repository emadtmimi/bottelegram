import 'dotenv/config';
import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
import sharp from 'sharp';
import crypto from 'crypto';

const userData = {};
const FREE_LIMIT = 2; // عدد الصور المسموح مجاناً
const SECRET_KEY = "emadok"; // مفتاح سري لا يعرفه أحد غيرك
const TELEGRAM_USERNAME = "em_mg"; 
const BOT_TOKEN = process.env.BOT_TOKEN || 'PUT_YOUR_TOKEN_HERE';
if (!BOT_TOKEN || BOT_TOKEN === 'PUT_YOUR_TOKEN_HERE') {
  console.error('❌ ضع توكن البوت في BOT_TOKEN (env).');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// دالة توليد الرقم التسلسلي من Telegram ID
function generateSerial(userId) {
  return crypto.createHash('md5').update(userId + SECRET_KEY).digest('hex').substring(0, 8);
}

// دالة توليد كود التفعيل من الرقم التسلسلي
function generateActivationCode(serial) {
  return crypto.createHash('sha256').update(serial + SECRET_KEY).digest('hex').substring(0, 8).toUpperCase();
}
bot.command('myid', (ctx) => {
  ctx.reply(`🆔 ID الخاص بك هو: ${ctx.from.id}`);
});
// أمر عرض الرقم التسلسلي للمستخدم
bot.command('serial', async (ctx) => {
  const userId = ctx.from.id.toString();
  const serial = generateSerial(userId);
  if (!userData[userId]) {
    userData[userId] = { activated: false, count: 0, serial };
  }
  await ctx.reply( `🔑 الرقم التسلسلي الخاص بك: ${userData[userId].serial}\n` +
        `📩 للحصول على كود التفعيل، تواصل معي عبر هذا الرابط:\n` +
        `https://t.me/${TELEGRAM_USERNAME}?start=${userData[userId].serial}`);
});

// أمر التفعيل
bot.command('activate', async (ctx) => {
  const userId = ctx.from.id.toString();
  const serial = userData[userId]?.serial || generateSerial(userId);

  const code = ctx.message.text.split(' ')[1];
  if (!code) {
    return ctx.reply('❗ أرسل كود التفعيل هكذا:\n/activate كود_التفعيل');
  }

  const correctCode = generateActivationCode(serial);
  if (code.toUpperCase() === correctCode) {
    userData[userId].activated = true;
    userData[userId].count = 0;
    await ctx.reply('✅ تم التفعيل بنجاح! يمكنك الآن معالجة عدد غير محدود من الصور.');
  } else {
    await ctx.reply('❌ كود التفعيل غير صحيح.');
  }
});

// التحقق قبل معالجة أي صورة
async function checkUserLimit(ctx) {
  const userId = ctx.from.id.toString();
  if (!userData[userId]) {
    const serial = generateSerial(userId);
    userData[userId] = { activated: false, count: 0, serial };
  }

  if (!userData[userId].activated) {
    if (userData[userId].count >= FREE_LIMIT) {
       await ctx.reply(
        `⚠️ انتهت الفترة التجريبية.\n` +
        `🔑 الرقم التسلسلي الخاص بك: ${userData[userId].serial}\n` +
        `📩 للحصول على كود التفعيل، تواصل معي عبر هذا الرابط:\n` +
        `https://t.me/${TELEGRAM_USERNAME}?start=${userData[userId].serial}`
      );
      return false;
    }
    userData[userId].count++;
  }
  return true;
}


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
   // التحقق من الحد
  if (!(await checkUserLimit(ctx))) return;
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
