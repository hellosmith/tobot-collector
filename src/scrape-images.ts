#!/usr/bin/env tsx

/**
 * 수집된 데이터의 이미지를 로컬에 다운로드
 * data/*.json의 image_url → images/ 폴더로 저장
 * 이미지를 webp로 변환하고 리사이즈 (500x500)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import chalk from "chalk";
import ora from "ora";
import sharp from "sharp";
import type { CollectionResult } from "./types.js";

const DATA_DIR = path.resolve("data");
const IMAGES_DIR = path.resolve("images");

async function downloadAndProcess(
  url: string,
  outputPath: string,
  size = 500,
): Promise<boolean> {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    await sharp(Buffer.from(response.data))
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .webp({ quality: 85 })
      .toFile(outputPath);

    return true;
  } catch {
    return false;
  }
}

async function processCollection(filename: string, subdir: string) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(chalk.yellow(`⚠ ${filename} 없음. 스킵.`));
    return;
  }

  const collection: CollectionResult = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const outputDir = path.join(IMAGES_DIR, subdir);
  fs.mkdirSync(outputDir, { recursive: true });

  const spinner = ora(`${collection.franchise} 이미지 다운로드 중...`).start();
  let success = 0;
  let fail = 0;

  for (const char of collection.characters) {
    if (!char.image_url) {
      fail++;
      continue;
    }

    const outputPath = path.join(outputDir, `${char.id}.webp`);

    // 이미 다운로드한 경우 스킵
    if (fs.existsSync(outputPath)) {
      char.image_local = outputPath;
      success++;
      continue;
    }

    spinner.text = `다운로드: ${char.name}`;
    const ok = await downloadAndProcess(char.image_url, outputPath);
    if (ok) {
      char.image_local = outputPath;
      success++;
    } else {
      fail++;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  // 업데이트된 데이터 저장
  fs.writeFileSync(filePath, JSON.stringify(collection, null, 2), "utf-8");

  spinner.succeed(`${collection.franchise}: ${success}개 성공, ${fail}개 실패`);
}

async function main() {
  console.log(chalk.bold.cyan("\n📥 이미지 다운로드 & 변환\n"));

  await processCollection("tobot.json", "tobot");
  await processCollection("metalcardbot.json", "metalcardbot");

  console.log(chalk.bold.green("\n✅ 이미지 처리 완료\n"));
}

main().catch(console.error);
