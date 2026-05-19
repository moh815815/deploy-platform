#!/bin/bash
# تشغيل موقع نشر مجاني

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       🚀 نشر مجاني - Free Deploy         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check Node
if ! command -v node &> /dev/null; then
  echo "❌ Node.js غير مثبت. قم بتثبيته من https://nodejs.org"
  exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "🚀 تشغيل السيرفر..."
echo ""

PORT=${PORT:-3000} node server.js
