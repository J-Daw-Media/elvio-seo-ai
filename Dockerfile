FROM node:22-alpine
WORKDIR /app
COPY elvio-seo-ai /app/elvio-seo-ai
WORKDIR /app/elvio-seo-ai
USER node
CMD ["node", "src/job.js"]
