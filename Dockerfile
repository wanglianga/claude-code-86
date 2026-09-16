# ============================================================
# 鲜达团餐 · 企业团餐预订与临期鲜食调拨平台
# 多阶段构建：前端构建 → 后端构建 → 生产运行时（非 root）
# ============================================================

# ---------- 阶段 1：构建 Vue 3 前端 ----------
FROM node:20-alpine AS web-build
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 阶段 2：构建 NestJS 后端 ----------
FROM node:20-alpine AS server-build
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npm run build \
  && npm prune --omit=dev

# ---------- 阶段 3：生产运行时 ----------
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# 非 root 用户运行
RUN addgroup -S app && adduser -S app -G app

COPY --from=server-build /build/server/node_modules ./node_modules
COPY --from=server-build /build/server/dist ./dist
COPY --from=server-build /build/server/package.json ./package.json
COPY --from=web-build /build/web/dist ./public

RUN chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "dist/main.js"]
