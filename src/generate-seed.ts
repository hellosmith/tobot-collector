#!/usr/bin/env tsx

/**
 * weloveit.co.kr용 시드 데이터 생성기
 *
 * data/tobot.json + data/metalcardbot.json → data/weloveit-seed.json
 *
 * Rails 앱에서 바로 import할 수 있는 포맷으로 출력
 */

import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import type { CollectionResult, SeedData } from "./types.js";

const DATA_DIR = path.resolve("data");

function loadCollection(filename: string): CollectionResult | null {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(chalk.yellow(`⚠ ${filename} 없음. 먼저 수집을 실행하세요.`));
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function main() {
  console.log(chalk.bold.cyan("\n🌱 weloveit.co.kr 시드 데이터 생성\n"));

  const seeds: SeedData[] = [];

  // 또봇
  const tobot = loadCollection("tobot.json");
  if (tobot) {
    seeds.push({
      content_slug: "tobot",
      content_name: "또봇",
      category: "robot",
      color: "#FF6B35",
      characters: tobot.characters.map((c) => ({
        name: c.name,
        image_path: c.image_url || c.image_local || "",
        description: [
          c.description,
          c.vehicle ? `차량: ${c.vehicle}` : null,
          c.color ? `색상: ${c.color}` : null,
          c.type ? `유형: ${c.type}` : null,
          c.series ? `시리즈: ${c.series}` : null,
          c.features?.length ? `특징: ${c.features.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
      })),
    });
    console.log(chalk.green(`  ✓ 또봇: ${tobot.characters.length}개 캐릭터`));
  }

  // 메탈카드봇
  const metalcardbot = loadCollection("metalcardbot.json");
  if (metalcardbot) {
    seeds.push({
      content_slug: "metalcardbot",
      content_name: "메탈카드봇",
      category: "robot",
      color: "#6366F1",
      characters: metalcardbot.characters.map((c) => ({
        name: c.name,
        image_path: c.image_url || c.image_local || "",
        description: [
          c.description,
          c.color ? `색상: ${c.color}` : null,
          c.type ? `유형: ${c.type}` : null,
          c.series ? `시리즈: ${c.series}` : null,
          c.features?.length ? `특징: ${c.features.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
      })),
    });
    console.log(chalk.green(`  ✓ 메탈카드봇: ${metalcardbot.characters.length}개 캐릭터`));
  }

  if (seeds.length === 0) {
    console.log(chalk.red("❌ 수집된 데이터가 없습니다."));
    process.exit(1);
  }

  // ── weloveit 시드 JSON ──
  const seedFile = path.join(DATA_DIR, "weloveit-seed.json");
  fs.writeFileSync(seedFile, JSON.stringify(seeds, null, 2), "utf-8");
  console.log(chalk.bold.green(`\n✅ 시드 파일 생성: ${seedFile}`));

  // ── Rails db:seed 스크립트 생성 ──
  const rubyScript = generateRubySeed(seeds);
  const rubyFile = path.join(DATA_DIR, "seeds.rb");
  fs.writeFileSync(rubyFile, rubyScript, "utf-8");
  console.log(chalk.bold.green(`✅ Rails 시드 생성: ${rubyFile}`));

  // ── CSV 내보내기 ──
  for (const seed of seeds) {
    const csvFile = path.join(DATA_DIR, `${seed.content_slug}.csv`);
    const header = "name,image_path,description";
    const rows = seed.characters.map(
      (c) => `"${c.name}","${c.image_path}","${(c.description || "").replace(/"/g, '""')}"`
    );
    fs.writeFileSync(csvFile, [header, ...rows].join("\n"), "utf-8");
    console.log(chalk.dim(`  CSV: ${csvFile}`));
  }

  console.log();
}

function generateRubySeed(seeds: SeedData[]): string {
  let ruby = `# 자동 생성된 시드 파일 - weloveit.co.kr
# 생성일: ${new Date().toISOString()}
#
# 사용법: rails db:seed 또는 rails runner db/seeds/characters.rb

`;

  for (const seed of seeds) {
    ruby += `# ── ${seed.content_name} ──────────────────────────────────\n`;
    ruby += `content = Content.find_or_create_by!(slug: "${seed.content_slug}") do |c|\n`;
    ruby += `  c.name = "${seed.content_name}"\n`;
    ruby += `  c.category = "${seed.category}"\n`;
    ruby += `  c.color = "${seed.color}"\n`;
    ruby += `end\n\n`;
    ruby += `puts "#{content.name}: 캐릭터 추가 중..."\n\n`;

    ruby += `[\n`;
    for (const char of seed.characters) {
      const desc = (char.description || "").replace(/"/g, '\\"');
      ruby += `  { name: "${char.name}", image_path: "${char.image_path}", description: "${desc}" },\n`;
    }
    ruby += `].each do |attrs|\n`;
    ruby += `  content.characters.find_or_create_by!(name: attrs[:name]) do |ch|\n`;
    ruby += `    ch.image_path = attrs[:image_path]\n`;
    ruby += `    ch.description = attrs[:description]\n`;
    ruby += `  end\n`;
    ruby += `end\n\n`;
    ruby += `puts "  → #{content.characters.count}개 캐릭터 완료"\n\n`;
  }

  return ruby;
}

main();
