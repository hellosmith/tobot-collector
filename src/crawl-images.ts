#!/usr/bin/env tsx

/**
 * 또봇 & 메탈카드봇 이미지 대량 크롤링 + 배경 투명화
 *
 * - 캐릭터당 최대 N장 이미지 수집 (구글 이미지 검색)
 * - 썸네일 클릭 → 원본 고해상도 이미지 URL 추출
 * - 모든 이미지 배경 자동 제거 (투명 PNG)
 *
 * 사용법:
 *   npx tsx src/crawl-images.ts                        # 전체 (기본 10장)
 *   npx tsx src/crawl-images.ts --target tobot         # 또봇만
 *   npx tsx src/crawl-images.ts --target metalcardbot
 *   npx tsx src/crawl-images.ts --max 5                # 캐릭터당 최대 5장
 *   npx tsx src/crawl-images.ts --skip-bg              # 배경 제거 스킵
 */

import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import chalk from "chalk";
import ora from "ora";
import sharp from "sharp";
import puppeteer, { type Browser, type Page } from "puppeteer";
import type { CollectionResult } from "./types.js";

const DATA_DIR = path.resolve("data");
const IMAGES_DIR = path.resolve("images");
const MAX_IMAGES_DEFAULT = 10;
const IMAGE_SIZE = 500;
const SEARCH_DELAY = 2500;
const DOWNLOAD_DELAY = 300;

const args = process.argv.slice(2);
const targetArg = args.includes("--target") ? args[args.indexOf("--target") + 1] : "all";
const maxImages = args.includes("--max") ? parseInt(args[args.indexOf("--max") + 1]) : MAX_IMAGES_DEFAULT;
const skipBg = args.includes("--skip-bg");

// ─── 배경 제거 ───────────────────────────────────────────────────
let removeBgFn: ((input: Blob) => Promise<Blob>) | null = null;

async function initBgRemoval() {
  if (skipBg) {
    console.log(chalk.dim("  배경 제거: OFF (--skip-bg)"));
    return;
  }
  const spinner = ora("배경 제거 AI 모델 로딩 중...").start();
  try {
    const m = await import("@imgly/background-removal-node");
    removeBgFn = m.removeBackground;
    spinner.succeed("배경 제거 AI 모델 로드 완료");
  } catch {
    spinner.warn("배경 제거 모델 로드 실패 → 원본 저장");
  }
}

async function removeBg(buf: Buffer): Promise<Buffer> {
  if (!removeBgFn) return buf;
  try {
    const blob = new Blob([buf as unknown as ArrayBuffer]);
    const result = await removeBgFn(blob);
    return Buffer.from(await result.arrayBuffer());
  } catch {
    return buf;
  }
}

// ─── 구글 이미지 검색 → 썸네일 클릭 → 원본 URL 추출 ─────────────
async function searchAndCollectImages(
  page: Page,
  query: string,
  maxCount: number,
): Promise<{ url: string; isBase64: boolean }[]> {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=ko`;

  try {
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 25000 });
  } catch {
    return [];
  }

  // 스크롤
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise((r) => setTimeout(r, 600));
  }

  // 방법 1: 썸네일을 클릭해서 사이드 패널에서 원본 URL 추출
  const results: { url: string; isBase64: boolean }[] = [];

  // 모든 썸네일 img 요소 선택
  const thumbs = await page.$$("img.YQ4gaf");
  const totalThumbs = Math.min(thumbs.length, maxCount * 3);

  for (let i = 0; i < totalThumbs && results.length < maxCount; i++) {
    try {
      // 썸네일 클릭
      await thumbs[i].click();
      await new Promise((r) => setTimeout(r, 1200));

      // 사이드 패널에서 원본 이미지 URL 추출
      const imgUrl = await page.evaluate(() => {
        // 큰 이미지를 표시하는 img 요소 찾기
        const bigImgs = document.querySelectorAll("img.sFlh5c, img.iPVvYb, img[jsname='kn3ccd'], img.r48jcc");
        for (const img of bigImgs) {
          const src = (img as HTMLImageElement).src;
          if (src && src.startsWith("http") && !src.includes("gstatic.com") && !src.includes("google.com")) {
            return src;
          }
        }

        // data-src 확인
        const allImgs = document.querySelectorAll("img[data-src]");
        for (const img of allImgs) {
          const src = (img as HTMLElement).dataset.src || "";
          if (src.startsWith("http") && !src.includes("gstatic") && !src.includes("google.com")) {
            return src;
          }
        }

        return null;
      });

      if (imgUrl && !results.some((r) => r.url === imgUrl)) {
        results.push({ url: imgUrl, isBase64: false });
        continue;
      }

      // 원본 못 찾으면 base64 썸네일 저장
      const base64 = await thumbs[i].evaluate((el) => {
        const img = el as HTMLImageElement;
        if (img.src?.startsWith("data:image") && img.naturalWidth >= 100) return img.src;
        return null;
      });

      if (base64 && !results.some((r) => r.url === base64)) {
        results.push({ url: base64, isBase64: true });
      }
    } catch {
      continue;
    }
  }

  // 방법 2: base64 썸네일 추가 수집 (부족분)
  if (results.length < maxCount) {
    const base64Images = await page.evaluate(
      ({ minW, needed }: { minW: number; needed: number }) => {
        const imgs: string[] = [];
        document.querySelectorAll("img").forEach((img) => {
          if (imgs.length >= needed) return;
          const src = img.src;
          if (src?.startsWith("data:image") && img.naturalWidth >= minW && img.naturalHeight >= minW) {
            imgs.push(src);
          }
        });
        return imgs;
      },
      { minW: 100, needed: maxCount - results.length + 5 },
    );

    for (const b64 of base64Images) {
      if (results.length >= maxCount) break;
      if (!results.some((r) => r.url === b64)) {
        results.push({ url: b64, isBase64: true });
      }
    }
  }

  return results.slice(0, maxCount);
}

// ─── 이미지 다운로드 & 처리 ──────────────────────────────────────
async function processImage(
  source: { url: string; isBase64: boolean },
  outputPath: string,
): Promise<boolean> {
  try {
    let buffer: Buffer;

    if (source.isBase64) {
      // data:image/jpeg;base64,xxxxx → Buffer
      const match = source.url.match(/^data:image\/\w+;base64,(.+)$/);
      if (!match) return false;
      buffer = Buffer.from(match[1], "base64");
    } else {
      const response = await axios.get(source.url, {
        responseType: "arraybuffer",
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
        maxContentLength: 20 * 1024 * 1024,
      });
      buffer = Buffer.from(response.data);
    }

    // 유효성 체크
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height || meta.width < 50 || meta.height < 50) return false;

    // 배경 제거
    buffer = await removeBg(buffer);

    // 리사이즈 + 투명 PNG
    await sharp(buffer)
      .resize(IMAGE_SIZE, IMAGE_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outputPath);

    return true;
  } catch {
    return false;
  }
}

// ─── 캐릭터별 이미지 크롤링 ──────────────────────────────────────
async function crawlCharacter(
  browser: Browser,
  charName: string,
  franchise: string,
  charId: string,
  outputDir: string,
  maxCount: number,
): Promise<string[]> {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  );
  await page.setViewport({ width: 1440, height: 900 });

  // 여러 검색어로 이미지 수집
  const queries = [
    `${charName} ${franchise} 로봇`,
    `${charName} ${franchise} 장난감 PNG 투명`,
    `${charName} tobot robot toy`,
  ];

  const allSources = new Map<string, { url: string; isBase64: boolean }>();

  for (const query of queries) {
    if (allSources.size >= maxCount * 2) break;
    const imgs = await searchAndCollectImages(page, query, maxCount);
    for (const img of imgs) {
      const key = img.isBase64 ? img.url.slice(0, 100) : img.url;
      if (!allSources.has(key)) allSources.set(key, img);
    }
    await new Promise((r) => setTimeout(r, SEARCH_DELAY));
  }

  await page.close();

  // 다운로드 & 처리
  const paths: string[] = [];
  let idx = 0;

  for (const source of allSources.values()) {
    if (paths.length >= maxCount) break;
    idx++;

    const filename = `${charId}_${String(idx).padStart(2, "0")}.png`;
    const outputPath = path.join(outputDir, filename);

    if (fs.existsSync(outputPath)) {
      paths.push(outputPath);
      continue;
    }

    const ok = await processImage(source, outputPath);
    if (ok) paths.push(outputPath);

    await new Promise((r) => setTimeout(r, DOWNLOAD_DELAY));
  }

  return paths;
}

// ─── 컬렉션 처리 ─────────────────────────────────────────────────
async function processCollection(
  browser: Browser,
  filename: string,
  subdir: string,
  franchise: string,
) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(chalk.yellow(`⚠ ${filename} 없음`));
    return;
  }

  const collection: CollectionResult = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const outputDir = path.join(IMAGES_DIR, subdir);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(chalk.bold(`\n📦 ${collection.franchise} — ${collection.characters.length}개 캐릭터\n`));

  let totalImages = 0;

  for (let i = 0; i < collection.characters.length; i++) {
    const char = collection.characters[i];
    const tag = `[${i + 1}/${collection.characters.length}]`;
    const spinner = ora(`${tag} ${char.name}`).start();

    try {
      const paths = await crawlCharacter(browser, char.name, franchise, char.id, outputDir, maxImages);

      (char as any).images = paths;
      if (paths.length > 0) char.image_local = paths[0];
      totalImages += paths.length;

      spinner.succeed(`${tag} ${chalk.bold(char.name)}: ${chalk.green(`${paths.length}장`)}`);
    } catch {
      spinner.fail(`${tag} ${char.name}: 실패`);
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(collection, null, 2), "utf-8");
  console.log(chalk.bold.green(`\n  ✅ ${collection.franchise}: 총 ${totalImages}장`));
}

// ─── 메인 ────────────────────────────────────────────────────────
async function main() {
  console.log(chalk.bold.cyan("\n🖼️  이미지 대량 크롤링 + 배경 투명화\n"));
  console.log(chalk.dim(`  대상: ${targetArg} | 최대: ${maxImages}장/캐릭터 | 배경제거: ${skipBg ? "OFF" : "ON"}`));

  await initBgRemoval();

  const spinner = ora("브라우저 시작...").start();
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  spinner.succeed("브라우저 준비 완료");

  try {
    if (targetArg === "all" || targetArg === "tobot") {
      await processCollection(browser, "tobot.json", "tobot", "또봇");
    }
    if (targetArg === "all" || targetArg === "metalcardbot") {
      await processCollection(browser, "metalcardbot.json", "metalcardbot", "메탈카드봇");
    }
  } finally {
    await browser.close();
  }

  // 통계
  console.log(chalk.bold.cyan("\n" + "━".repeat(50)));
  for (const subdir of ["tobot", "metalcardbot"]) {
    const dir = path.join(IMAGES_DIR, subdir);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
      const totalSize = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
      console.log(chalk.dim(`  ${subdir}: ${files.length}장 (${(totalSize / 1024 / 1024).toFixed(1)}MB)`));
    }
  }
  console.log(chalk.bold.cyan("━".repeat(50) + "\n"));
}

main().catch(console.error);
