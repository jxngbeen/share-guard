# 배포와 설치 — v0.4.5

기준일: 2026-10-27 (Asia/Seoul). Chrome 127 이상에서 압축 해제 방식으로 설치합니다. Chrome 웹 스토어에는 등록하지 않았습니다.

- [소개·체험 사이트](https://share-guard.duskyscarf34.chatgpt.site/): 로그인 없이 열람하는 정적 사이트.
- [GitHub Release](https://github.com/jxngbeen/share-guard/releases/tag/v0.4.5): 설치 ZIP과 SHA256 검증 파일, 변경 내용.
- [설치 ZIP](https://github.com/jxngbeen/share-guard/releases/download/v0.4.5/share-guard-v0.4.5.zip): 확장 실행 파일 15개만 포함.

## 설치 파일 확인

파일명: `share-guard-v0.4.5.zip`

```text
3a854bbc5e5d73c998bfdf671e343839f39f78575e7a958e08c078f435498f1d
```

macOS에서는 `shasum -a 256 share-guard-v0.4.5.zip`으로 비교할 수 있습니다. GitHub가 자동 생성하는 Source code 압축 파일은 저장소 전체 소스이며, 위 설치 ZIP과 다릅니다.

압축을 푼 뒤 `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램 로드**를 눌러 `manifest.json`이 바로 있는 폴더를 선택합니다. ZIP 자체를 선택하지 않습니다. 상세 사용·지원 범위는 [README](README.md)를 참고하세요.

## 검증한 범위

검증한 ZIP은 소스의 확장15파일과 일치합니다. 새 Chrome for Testing155.0.8059.12 프로필에서 실제 기본 팝업·선택·가리기/삭제/복원·커서를 확인했습니다. Node180개, 브라우저46개, 선택/정지19개가 통과했습니다. 새 감지 표본은139/140 일치, 사전 기대 기준TP70/FP1/FN0입니다. [점검 보고서](FINAL_CHECK.md)와 [표본 평가](DETECTION_HOLDOUT.md)를 참고하세요.

이 설치 검증은 다운로드 ZIP의 압축 해제 폴더를 CLI로 로드한 결과입니다. 모든 Chrome 버전이나 수동 설치 메뉴 절차를 자동 검증한 것은 아닙니다. 실제 네이버·OS 한글 입력기 이력과 합성 모델 검증도 [TESTING.md](TESTING.md)에서 구분합니다.

## 소스에서 빌드

Node.js24와 zip 명령을 사용하며 npm 의존성 설치나 AI API 키가 필요하지 않습니다.

```sh
npm test
npm run site:build
npm run site:preview
```

정적 결과는 `dist/site/`, 로컬 미리보기는 `http://127.0.0.1:4175`입니다. 빌드는15파일의 설치 ZIP도 만들지만 파일 타임스탬프 때문에 전체 ZIP 해시가 공식 Release와 달라질 수 있습니다. 최종 사용자에게는 Release의 검증된 ZIP을 권장합니다.

배포할 파일은 index.html, styles.css, app.js, motion.js, detector.js, popup.css, legal.css, terms.html, privacy.html, assets/mark.svg, assets/wordmark.svg, assets/icon.svg, assets/icon-180.png 및 같은 검증본의 downloads/share-guard-v0.4.5.zip입니다. 웹의 공식 다운로드 버튼은 GitHub Release 자산으로 연결합니다. 저장소 전체·테스트 프로필·개인 기록을 정적 호스팅 디렉터리에 넣지 않습니다.

사이트와 확장은 원문을 브라우저에서 처리하며 별도 서버·DB·AI API를 사용하지 않습니다. 정적 호스팅과 GitHub 다운로드의 접속 기록은 각 제공자의 정책을 따릅니다. 공개 파일·이력과 작성자 noreply 메타데이터를 점검한 뒤 배포합니다.
