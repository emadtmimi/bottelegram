# صورة Node رسمية
FROM node:18

# تثبيت المتطلبات النظامية لـ pdf2pic/gm
RUN apt-get update && \
    apt-get install -y graphicsmagick ghostscript && \
    rm -rf /var/lib/apt/lists/*

# مجلد العمل
WORKDIR /app

# نسخ ملفات الحزم أولاً للاستفادة من cache
COPY package*.json ./

# تثبيت الحزم
RUN npm ci --omit=dev

# نسخ بقية المشروع
COPY . .

# تشغيل البوت
CMD ["node", "index.js"]
