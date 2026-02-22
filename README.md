# 🤖 또봇 & 메탈카드봇 캐릭터 수집기

[weloveit.co.kr](https://weloveit.co.kr)용 캐릭터 데이터 수집 도구

## 수집 대상

| 프랜차이즈 | 캐릭터 수 | 시리즈 |
|-----------|----------|--------|
| 또봇 | 35+ | 1기, 에볼루션, 어드벤처, V, 갤럭시 디텍티브, 아슬론, 또봇2 |
| 메탈카드봇 | 20+ | 1기, 울트라, 타이탄 |

## 설치 & 실행

```bash
npm install

# 또봇 수집
npm run collect:tobot

# 메탈카드봇 수집
npm run collect:metalcardbot

# 전체 수집
npm run collect:all

# 이미지 다운로드 (수집 후)
npm run scrape:images

# weloveit 시드 데이터 생성
npm run generate:seed
```

## 출력 파일

```
data/
├── tobot.json           # 또봇 전체 데이터
├── metalcardbot.json    # 메탈카드봇 전체 데이터
├── weloveit-seed.json   # weloveit.co.kr용 통합 시드
├── seeds.rb             # Rails db:seed 스크립트
├── tobot.csv            # CSV 내보내기
└── metalcardbot.csv     # CSV 내보내기

images/
├── tobot/               # 또봇 이미지 (500x500 webp)
└── metalcardbot/        # 메탈카드봇 이미지
```

## weloveit.co.kr 연동

### Rails 시드
```bash
cp data/seeds.rb your-rails-app/db/seeds/characters.rb
cd your-rails-app && rails db:seed
```

### JSON API
```ruby
# app/controllers/api/characters_controller.rb
seed_data = JSON.parse(File.read("data/weloveit-seed.json"))
```
