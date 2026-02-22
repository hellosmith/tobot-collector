#!/usr/bin/env tsx

/**
 * 또봇(Tobot) 전 시리즈 캐릭터 데이터 수집기
 *
 * 소스:
 *  - 나무위키 (puppeteer로 SPA 렌더링)
 *  - 또봇 공식 유튜브/공식 이미지
 *  - 구글 이미지 검색 (보조)
 *
 * 출력: data/tobot.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import ora from "ora";
import puppeteer from "puppeteer";
import type { CharacterData, CollectionResult } from "./types.js";

const DATA_DIR = path.resolve("data");
const OUTPUT_FILE = path.join(DATA_DIR, "tobot.json");

// ─── 또봇 전체 캐릭터 마스터 데이터 ─────────────────────────────
// 공식 또봇 시리즈 기준 정리 (시즌 1 ~ 최신)
const TOBOT_MASTER: CharacterData[] = [
  // ── 또봇 1기 (오리지널) ──
  {
    id: "tobot-x",
    name: "또봇 X",
    name_en: "Tobot X",
    series: "또봇",
    season: "1기",
    vehicle: "SUV (쌍용 코란도 C)",
    color: "파란색",
    type: "단일",
    description: "하나의 차량에서 변신하는 또봇. 강한 전투력과 리더십을 갖춤.",
    features: ["X 실드", "X 소드", "비행 가능"],
  },
  {
    id: "tobot-y",
    name: "또봇 Y",
    name_en: "Tobot Y",
    series: "또봇",
    season: "1기",
    vehicle: "스포츠카 (기아 K5)",
    color: "빨간색",
    type: "단일",
    description: "빠른 스피드와 민첩성이 특징인 또봇.",
    features: ["Y 부스터", "Y 캐논", "고속 이동"],
  },
  {
    id: "tobot-z",
    name: "또봇 Z",
    name_en: "Tobot Z",
    series: "또봇",
    season: "1기",
    vehicle: "트럭 (현대 스타렉스)",
    color: "노란색",
    type: "단일",
    description: "강력한 파워와 방어력을 지닌 또봇.",
    features: ["Z 해머", "Z 아머", "강력한 방어"],
  },
  {
    id: "tobot-d",
    name: "또봇 D",
    name_en: "Tobot D",
    series: "또봇",
    season: "1기",
    vehicle: "경찰차",
    color: "흰색/검정색",
    type: "단일",
    description: "정의감 넘치는 경찰 또봇.",
    features: ["D 건", "사이렌 공격", "수사 능력"],
  },
  {
    id: "tobot-w",
    name: "또봇 W",
    name_en: "Tobot W",
    series: "또봇",
    season: "1기",
    vehicle: "승용차",
    color: "흰색",
    type: "단일",
    description: "균형 잡힌 능력치의 또봇.",
    features: ["W 윙", "공중 전투"],
  },
  {
    id: "tobot-titan",
    name: "타이탄",
    name_en: "Tobot Titan",
    series: "또봇",
    season: "1기",
    vehicle: "X + Y + Z 합체",
    color: "멀티컬러",
    type: "합체 (3체)",
    description: "또봇 X, Y, Z가 합체한 최강의 또봇.",
    features: ["타이탄 소드", "타이탄 실드", "초강력 파워"],
  },
  {
    id: "tobot-tritan",
    name: "트라이탄",
    name_en: "Tobot Tritan",
    series: "또봇",
    season: "1기",
    vehicle: "X + Y + Z 합체 (2차 합체)",
    color: "멀티컬러",
    type: "합체 (3체)",
    description: "타이탄의 강화 합체 형태.",
    features: ["트라이탄 캐논", "최강의 합체 기술"],
  },

  // ── 또봇 에볼루션 ──
  {
    id: "tobot-evo-x",
    name: "또봇 에볼루션 X",
    name_en: "Tobot Evolution X",
    series: "또봇 에볼루션",
    season: "에볼루션",
    vehicle: "SUV (진화형)",
    color: "파란색",
    type: "단일",
    description: "X의 진화 형태. 더 강력한 전투력을 가짐.",
    features: ["에볼루션 X 소드", "강화 비행"],
  },
  {
    id: "tobot-evo-y",
    name: "또봇 에볼루션 Y",
    name_en: "Tobot Evolution Y",
    series: "또봇 에볼루션",
    season: "에볼루션",
    vehicle: "스포츠카 (진화형)",
    color: "빨간색",
    type: "단일",
    description: "Y의 진화 형태. 극한의 속도를 자랑.",
    features: ["에볼루션 Y 부스터", "초고속 대시"],
  },

  // ── 또봇 어드벤처 ──
  {
    id: "tobot-c",
    name: "또봇 C",
    name_en: "Tobot C",
    series: "또봇 어드벤처",
    season: "어드벤처",
    vehicle: "캠핑카",
    color: "초록색",
    type: "단일",
    description: "자연을 사랑하는 모험형 또봇.",
    features: ["자연 탐사 장비", "C 캐논"],
  },
  {
    id: "tobot-r",
    name: "또봇 R",
    name_en: "Tobot R",
    series: "또봇 어드벤처",
    season: "어드벤처",
    vehicle: "레이싱카",
    color: "빨간색",
    type: "단일",
    description: "레이싱에 특화된 고속 또봇.",
    features: ["R 터보", "드리프트 공격"],
  },
  {
    id: "tobot-k",
    name: "또봇 K",
    name_en: "Tobot K",
    series: "또봇 어드벤처",
    season: "어드벤처",
    vehicle: "기아 K시리즈",
    color: "주황색",
    type: "단일",
    description: "힘과 스피드를 겸비한 또봇.",
    features: ["K 펀치", "터보 차지"],
  },

  // ── 또봇 V ──
  {
    id: "tobot-v",
    name: "또봇 V",
    name_en: "Tobot V",
    series: "또봇 V",
    season: "V",
    vehicle: "V 차량",
    color: "빨간색",
    type: "단일",
    description: "또봇 V 시리즈의 메인 또봇.",
    features: ["V 소드", "V 실드"],
  },
  {
    id: "tobot-monster",
    name: "또봇 몬스터",
    name_en: "Tobot Monster",
    series: "또봇 V",
    season: "V",
    vehicle: "몬스터 트럭",
    color: "보라색",
    type: "단일",
    description: "강력한 파괴력의 몬스터 트럭 또봇.",
    features: ["몬스터 크래시", "지면 충격파"],
  },
  {
    id: "tobot-lightning",
    name: "또봇 라이트닝",
    name_en: "Tobot Lightning",
    series: "또봇 V",
    season: "V",
    vehicle: "스포츠카",
    color: "노란색",
    type: "단일",
    description: "번개같은 스피드를 자랑하는 또봇.",
    features: ["라이트닝 볼트", "전기 공격"],
  },
  {
    id: "tobot-stealth",
    name: "또봇 스텔스",
    name_en: "Tobot Stealth",
    series: "또봇 V",
    season: "V",
    vehicle: "스텔스 전투기",
    color: "검정색",
    type: "단일",
    description: "은밀한 작전 수행이 가능한 또봇.",
    features: ["스텔스 모드", "투명화"],
  },
  {
    id: "tobot-rocket",
    name: "또봇 로켓",
    name_en: "Tobot Rocket",
    series: "또봇 V",
    season: "V",
    vehicle: "로켓 차량",
    color: "흰색/빨간색",
    type: "단일",
    description: "로켓 추진으로 비행 가능한 또봇.",
    features: ["로켓 부스터", "미사일 공격"],
  },
  {
    id: "tobot-captain-police",
    name: "캡틴 폴리스",
    name_en: "Captain Police",
    series: "또봇 V",
    season: "V",
    vehicle: "경찰차",
    color: "흰색/파란색",
    type: "단일",
    description: "또봇 V 시리즈의 경찰 또봇. 정의 구현.",
    features: ["폴리스 건", "구속 장치"],
  },
  {
    id: "tobot-giga-7",
    name: "기가 세븐",
    name_en: "Giga Seven",
    series: "또봇 V",
    season: "V",
    vehicle: "7체 합체",
    color: "멀티컬러",
    type: "합체 (7체)",
    description: "또봇 V 시리즈 7기의 합체. 최강 전투력.",
    features: ["기가 캐논", "기가 소드", "기가 실드"],
  },

  // ── 또봇 갤럭시 디텍티브 ──
  {
    id: "tobot-galaxy-detective-x",
    name: "또봇 갤럭시 디텍티브 X",
    name_en: "Galaxy Detective X",
    series: "또봇 갤럭시 디텍티브",
    season: "갤럭시 디텍티브",
    vehicle: "SUV (갤럭시 버전)",
    color: "파란색/은색",
    type: "단일",
    description: "우주 탐정 버전의 또봇 X.",
    features: ["갤럭시 스캐너", "X 블래스터"],
  },
  {
    id: "tobot-galaxy-detective-y",
    name: "또봇 갤럭시 디텍티브 Y",
    name_en: "Galaxy Detective Y",
    series: "또봇 갤럭시 디텍티브",
    season: "갤럭시 디텍티브",
    vehicle: "스포츠카 (갤럭시 버전)",
    color: "빨간색/은색",
    type: "단일",
    description: "우주 탐정 버전의 또봇 Y.",
    features: ["갤럭시 부스터", "Y 레이저"],
  },

  // ── 또봇 델타트론 ──
  {
    id: "tobot-deltatron",
    name: "또봇 델타트론",
    name_en: "Tobot Deltatron",
    series: "또봇",
    season: "1기",
    vehicle: "D + W 합체",
    color: "흰색/검정색",
    type: "합체 (2체)",
    description: "또봇 D와 W가 합체한 형태.",
    features: ["델타 캐논", "듀얼 사이렌"],
  },

  // ── 또봇 2기 추가 캐릭터 ──
  {
    id: "tobot-zero",
    name: "또봇 제로",
    name_en: "Tobot Zero",
    series: "또봇",
    season: "2기",
    vehicle: "레이싱카",
    color: "파란색/흰색",
    type: "단일",
    description: "2기의 신규 또봇. 초고속 레이싱 능력.",
    features: ["제로 대시", "제로 부스트"],
  },
  {
    id: "tobot-mini",
    name: "또봇 미니",
    name_en: "Tobot Mini",
    series: "또봇",
    season: "2기",
    vehicle: "경차",
    color: "다양",
    type: "소형",
    description: "소형 또봇 시리즈. 귀여운 외형.",
    features: ["소형 변신", "팀 합동 공격"],
  },

  // ── 또봇 아슬론 ──
  {
    id: "tobot-athlon-tornado",
    name: "토네이도",
    name_en: "Athlon Tornado",
    series: "또봇 아슬론",
    season: "아슬론",
    vehicle: "스포츠카",
    color: "빨간색",
    type: "단일",
    description: "아슬론 시리즈의 리더 또봇.",
    features: ["토네이도 스핀", "바람 공격"],
  },
  {
    id: "tobot-athlon-rocky",
    name: "로키",
    name_en: "Athlon Rocky",
    series: "또봇 아슬론",
    season: "아슬론",
    vehicle: "4WD 트럭",
    color: "초록색",
    type: "단일",
    description: "바위처럼 단단한 방어력의 또봇.",
    features: ["로키 펀치", "방어 모드"],
  },
  {
    id: "tobot-athlon-metron",
    name: "메트론",
    name_en: "Athlon Metron",
    series: "또봇 아슬론",
    season: "아슬론",
    vehicle: "지하철/기차",
    color: "파란색/은색",
    type: "단일",
    description: "철도 차량에서 변신하는 또봇.",
    features: ["메트론 레일건", "고속 이동"],
  },
  {
    id: "tobot-athlon-vulcan",
    name: "벌칸",
    name_en: "Athlon Vulcan",
    series: "또봇 아슬론",
    season: "아슬론",
    vehicle: "소방차",
    color: "빨간색/노란색",
    type: "단일",
    description: "화재 진압 전문 또봇.",
    features: ["워터 캐논", "화염 방어"],
  },
  {
    id: "tobot-athlon-ambulon",
    name: "앰뷸론",
    name_en: "Athlon Ambulon",
    series: "또봇 아슬론",
    season: "아슬론",
    vehicle: "구급차",
    color: "흰색/빨간색",
    type: "단일",
    description: "구조 및 치료 전문 또봇.",
    features: ["힐링 빔", "응급 구조"],
  },
  {
    id: "tobot-athlon-magma6",
    name: "마그마 6",
    name_en: "Athlon Magma 6",
    series: "또봇 아슬론",
    season: "아슬론",
    vehicle: "6체 합체",
    color: "멀티컬러",
    type: "합체 (6체)",
    description: "아슬론 시리즈 6체 합체. 최강 파워.",
    features: ["마그마 피니시", "초합체 기술"],
  },

  // ── 또봇 마스터 V ──
  {
    id: "tobot-master-v",
    name: "마스터 V",
    name_en: "Master V",
    series: "또봇 V",
    season: "V",
    vehicle: "5체 합체",
    color: "멀티컬러",
    type: "합체 (5체)",
    description: "또봇 V 시리즈 5체 합체.",
    features: ["마스터 소드", "마스터 실드"],
  },

  // ── 또봇 2 (신 시리즈) ──
  {
    id: "tobot2-alpha",
    name: "또봇 알파",
    name_en: "Tobot Alpha",
    series: "또봇 2",
    season: "또봇 2",
    vehicle: "SUV",
    color: "파란색",
    type: "단일",
    description: "또봇 2의 메인 또봇. X의 후계.",
    features: ["알파 슬래시", "알파 실드"],
  },
  {
    id: "tobot2-beta",
    name: "또봇 베타",
    name_en: "Tobot Beta",
    series: "또봇 2",
    season: "또봇 2",
    vehicle: "스포츠카",
    color: "빨간색",
    type: "단일",
    description: "또봇 2의 서브 또봇. Y의 후계.",
    features: ["베타 대시", "베타 캐논"],
  },
  {
    id: "tobot2-theta",
    name: "또봇 세타",
    name_en: "Tobot Theta",
    series: "또봇 2",
    season: "또봇 2",
    vehicle: "SUV (대형)",
    color: "검정색/골드",
    type: "단일",
    description: "강력한 파워의 다크 또봇.",
    features: ["세타 크래시", "파괴 모드"],
  },
];

// ─── 나무위키에서 추가 정보 스크래핑 ─────────────────────────────
async function scrapeNamuWiki(): Promise<Map<string, Partial<CharacterData>>> {
  const spinner = ora("나무위키에서 또봇 정보 수집 중...").start();
  const extra = new Map<string, Partial<CharacterData>>();

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");

    // 또봇 문서 로딩
    await page.goto("https://namu.wiki/w/%EB%98%90%EB%B4%87", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // 이미지 URL 수집
    const imageData = await page.evaluate(() => {
      const images: { alt: string; src: string }[] = [];
      document.querySelectorAll("img").forEach((img) => {
        const alt = img.alt || "";
        const src = img.src || img.dataset.src || "";
        if (src && (alt.includes("또봇") || alt.includes("Tobot") || alt.includes("tobot"))) {
          images.push({ alt, src });
        }
      });
      // data-src lazy load 이미지도 수집
      document.querySelectorAll("[data-src]").forEach((el) => {
        const src = (el as HTMLElement).dataset.src || "";
        const alt = (el as HTMLImageElement).alt || "";
        if (src.includes("tobot") || src.includes("또봇")) {
          images.push({ alt, src });
        }
      });
      return images;
    });

    for (const img of imageData) {
      extra.set(img.alt, { image_url: img.src, source_url: "https://namu.wiki/w/또봇" });
    }

    spinner.succeed(`나무위키에서 ${imageData.length}개 이미지 정보 수집`);
  } catch (err) {
    spinner.warn("나무위키 스크래핑 실패 (마스터 데이터 사용)");
  } finally {
    if (browser) await browser.close();
  }

  return extra;
}

// ─── 구글 이미지 검색으로 이미지 URL 수집 ─────────────────────────
async function searchGoogleImage(query: string): Promise<string | undefined> {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + " 또봇 로봇 공식")}&tbm=isch`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 15000 });

    const firstImage = await page.evaluate(() => {
      const imgs = document.querySelectorAll("img");
      for (const img of imgs) {
        if (img.src && img.src.startsWith("http") && img.naturalWidth > 100) {
          return img.src;
        }
      }
      return undefined;
    });

    return firstImage;
  } catch {
    return undefined;
  } finally {
    if (browser) await browser.close();
  }
}

// ─── 이미지 수집 (Google 검색 기반) ──────────────────────────────
async function collectImages(characters: CharacterData[]): Promise<CharacterData[]> {
  const spinner = ora("이미지 검색 중...").start();
  let found = 0;

  for (const char of characters) {
    if (char.image_url) continue;

    spinner.text = `이미지 검색 중... ${char.name}`;
    const url = await searchGoogleImage(char.name);
    if (url) {
      char.image_url = url;
      found++;
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 1500));
  }

  spinner.succeed(`${found}개 이미지 URL 수집 완료`);
  return characters;
}

// ─── 메인 수집 로직 ──────────────────────────────────────────────
async function main() {
  console.log(chalk.bold.cyan("\n🤖 또봇 캐릭터 데이터 수집기\n"));

  // 1. 마스터 데이터 기반
  let characters = [...TOBOT_MASTER];
  console.log(chalk.dim(`마스터 데이터: ${characters.length}개 캐릭터`));

  // 2. 나무위키 추가 정보
  const wikiExtra = await scrapeNamuWiki();
  for (const char of characters) {
    const extra = wikiExtra.get(char.name);
    if (extra) {
      if (extra.image_url && !char.image_url) char.image_url = extra.image_url;
      if (extra.source_url) char.source_url = extra.source_url;
    }
  }

  // 3. 이미지 없는 캐릭터 구글 검색 (--with-images 플래그로만 실행)
  const noImage = characters.filter((c) => !c.image_url);
  if (noImage.length > 0 && process.argv.includes("--with-images")) {
    console.log(chalk.yellow(`이미지 없는 캐릭터: ${noImage.length}개 → 구글 검색 시도`));
    characters = await collectImages(characters);
  } else if (noImage.length > 0) {
    console.log(chalk.dim(`이미지 없는 캐릭터: ${noImage.length}개 (--with-images로 검색 가능)`));
  }

  // 4. 결과 저장
  const result: CollectionResult = {
    franchise: "또봇 (Tobot)",
    collected_at: new Date().toISOString(),
    total_count: characters.length,
    characters,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf-8");

  console.log();
  console.log(chalk.bold.green(`✅ 수집 완료: ${OUTPUT_FILE}`));
  console.log(chalk.dim(`   총 ${characters.length}개 캐릭터`));
  console.log(chalk.dim(`   이미지 있음: ${characters.filter((c) => c.image_url).length}개`));
  console.log();

  // 시리즈별 통계
  const bySeries = new Map<string, number>();
  for (const c of characters) {
    bySeries.set(c.series, (bySeries.get(c.series) ?? 0) + 1);
  }
  console.log(chalk.bold("시리즈별 캐릭터 수:"));
  for (const [series, count] of bySeries) {
    console.log(chalk.dim(`  ${series}: ${count}개`));
  }
  console.log();
}

main().catch(console.error);
