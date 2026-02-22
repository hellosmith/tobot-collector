#!/usr/bin/env tsx

/**
 * 또봇 & 메탈카드봇 고해상도 이미지 대량 크롤링 + 배경 투명화
 *
 * - 구글 이미지 HTML 소스에서 원본 고해상도 URL 직접 추출
 * - 여러 검색어로 캐릭터당 최대 N장 수집
 * - AI 배경 제거 → 투명 PNG (1024x1024)
 *
 * 사용법:
 *   npx tsx src/crawl-images.ts                        # 전체
 *   npx tsx src/crawl-images.ts --target tobot
 *   npx tsx src/crawl-images.ts --target metalcardbot
 *   npx tsx src/crawl-images.ts --max 15               # 캐릭터당 최대 15장
 *   npx tsx src/crawl-images.ts --skip-bg              # 배경 제거 스킵
 *   npx tsx src/crawl-images.ts --size 1500            # 출력 크기 변경
 */

import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import chalk from "chalk";
import ora from "ora";
import sharp from "sharp";
import puppeteer, { type Browser } from "puppeteer";
import type { CollectionResult } from "./types.js";

// ─── 설정 ────────────────────────────────────────────────────────
const DATA_DIR = path.resolve("data");
const IMAGES_DIR = path.resolve("images");
const SEARCH_DELAY = 2000;
const MIN_WIDTH = 400;         // 최소 원본 해상도

const args = process.argv.slice(2);
const targetArg = args.includes("--target") ? args[args.indexOf("--target") + 1] : "all";
const maxImages = args.includes("--max") ? parseInt(args[args.indexOf("--max") + 1]) : 10;
const skipBg = args.includes("--skip-bg");
const outputSize = args.includes("--size") ? parseInt(args[args.indexOf("--size") + 1]) : 1024;

// ─── 배경 제거 ───────────────────────────────────────────────────
let removeBgFn: ((input: Blob) => Promise<Blob>) | null = null;

async function initBgRemoval() {
  if (skipBg) {
    console.log(chalk.dim("  배경 제거: OFF"));
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

// ─── 구글 이미지 HTML에서 원본 URL 직접 추출 ─────────────────────
// 구글은 페이지 HTML 내 JS 객체에 ["url", width, height] 형태로 원본 URL을 넣어둠
async function extractOriginalImageUrls(
  browser: Browser,
  query: string,
): Promise<{ url: string; width: number; height: number }[]> {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  );
  await page.setViewport({ width: 1440, height: 900 });

  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=ko`;
    await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });

    // 스크롤해서 더 많은 이미지 로드
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await new Promise((r) => setTimeout(r, 500));
    }

    // "결과 더보기" 버튼 클릭
    try {
      const moreBtn = await page.$('input[value="결과 더보기"]');
      if (moreBtn) {
        await moreBtn.click();
        await new Promise((r) => setTimeout(r, 2000));
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    } catch {}

    const html = await page.content();

    // 원본 URL 패턴 추출: ["https://...image.jpg", width, height]
    const pattern = /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)",\s*(\d+),\s*(\d+)\]/gi;
    const results: { url: string; width: number; height: number }[] = [];
    const seen = new Set<string>();
    let match;

    while ((match = pattern.exec(html)) !== null) {
      const imgUrl = match[1].replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
      const w = parseInt(match[2]);
      const h = parseInt(match[3]);

      if (
        w >= MIN_WIDTH &&
        h >= MIN_WIDTH &&
        !imgUrl.includes("google.com") &&
        !imgUrl.includes("gstatic.com") &&
        !imgUrl.includes("googleusercontent.com") &&
        !seen.has(imgUrl)
      ) {
        seen.add(imgUrl);
        results.push({ url: imgUrl, width: w, height: h });
      }
    }

    // 해상도 높은 순 정렬
    results.sort((a, b) => b.width * b.height - a.width * a.height);

    return results;
  } catch {
    return [];
  } finally {
    await page.close();
  }
}

// ─── 이미지 다운로드 + 배경 제거 + 리사이즈 ─────────────────────
async function downloadAndProcess(url: string, outputPath: string): Promise<boolean> {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "image/*,*/*",
        "Referer": "https://www.google.com/",
      },
      maxContentLength: 30 * 1024 * 1024,
    });

    let buffer = Buffer.from(response.data);

    // 유효성 체크
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return false;
    if (meta.width < MIN_WIDTH || meta.height < MIN_WIDTH) return false;

    // 배경 제거
    buffer = await removeBg(buffer);

    // 리사이즈 + 투명 PNG
    await sharp(buffer)
      .resize(outputSize, outputSize, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 6 })
      .toFile(outputPath);

    // 결과 파일 크기 체크 (너무 작으면 깨진 이미지)
    const stat = fs.statSync(outputPath);
    if (stat.size < 5000) {
      fs.unlinkSync(outputPath);
      return false;
    }

    return true;
  } catch {
    // 실패 시 파일 정리
    try { fs.unlinkSync(outputPath); } catch {}
    return false;
  }
}

// ─── 캐릭터별 크롤링 ────────────────────────────────────────────
async function crawlCharacter(
  browser: Browser,
  charName: string,
  franchise: string,
  charId: string,
  outputDir: string,
  maxCount: number,
): Promise<string[]> {
  // 다양한 검색어로 이미지 최대한 수집
  const queries = [
    `${charName} ${franchise} 로봇 공식 이미지`,
    `${charName} ${franchise} 변신 로봇 장난감`,
    `${charName} ${franchise} PNG 투명 배경`,
    `${charName} ${franchise} robot official`,
    `${charName} ${franchise} toy figure`,
  ];

  const allUrls = new Map<string, { url: string; width: number; height: number }>();

  for (const query of queries) {
    if (allUrls.size >= maxCount * 4) break;

    const imgs = await extractOriginalImageUrls(browser, query);
    for (const img of imgs) {
      if (!allUrls.has(img.url)) {
        allUrls.set(img.url, img);
      }
    }

    await new Promise((r) => setTimeout(r, SEARCH_DELAY));
  }

  // 해상도 높은 순으로 다운로드 시도
  const sorted = [...allUrls.values()].sort((a, b) => b.width * b.height - a.width * a.height);
  const paths: string[] = [];
  let idx = 0;

  for (const img of sorted) {
    if (paths.length >= maxCount) break;
    idx++;

    const filename = `${charId}_${String(idx).padStart(2, "0")}.png`;
    const outputPath = path.join(outputDir, filename);

    // 이미 존재하면 스킵
    if (fs.existsSync(outputPath)) {
      paths.push(outputPath);
      continue;
    }

    const ok = await downloadAndProcess(img.url, outputPath);
    if (ok) {
      paths.push(outputPath);
    }
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

      const sizes = paths.map((p) => {
        const s = fs.statSync(p).size;
        return `${(s / 1024).toFixed(0)}K`;
      });

      spinner.succeed(
        `${tag} ${chalk.bold(char.name)}: ${chalk.green(`${paths.length}장`)} ${chalk.dim(sizes.join(", "))}`,
      );
    } catch (err) {
      spinner.fail(`${tag} ${char.name}: 실패`);
    }
  }

  // 저장
  fs.writeFileSync(filePath, JSON.stringify(collection, null, 2), "utf-8");

  console.log(chalk.bold.green(`\n  ✅ ${collection.franchise}: 총 ${totalImages}장`));
  console.log(chalk.dim(`     위치: ${outputDir}/`));
}

// ─── 메인 ────────────────────────────────────────────────────────
async function main() {
  console.log(chalk.bold.cyan("\n🖼️  고해상도 이미지 크롤링 + 배경 투명화\n"));
  console.log(chalk.dim(`  대상: ${targetArg}`));
  console.log(chalk.dim(`  캐릭터당 최대: ${maxImages}장`));
  console.log(chalk.dim(`  출력 크기: ${outputSize}x${outputSize}px`));
  console.log(chalk.dim(`  최소 원본: ${MIN_WIDTH}px 이상만 수집`));
  console.log(chalk.dim(`  배경 제거: ${skipBg ? "OFF" : "ON"}`));
  console.log();

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
