# Browsers and system dependencies come from the image; keep the tag in sync with @playwright/test.
FROM mcr.microsoft.com/playwright:v1.65.0-noble

WORKDIR /app
ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["npx", "playwright", "test"]
