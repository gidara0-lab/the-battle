# The Battle

웹에서 플레이할 수 있는 보드게임 `더 배틀` 구현입니다.

## 실행

정적 웹페이지라서 별도 빌드가 필요 없습니다.

```bash
python3 -m http.server 5173
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:5173
```

## 구현된 기능

- 어려움 난이도 AI
- 한 라운드 2게임 진행
- 1게임 레드 선공, 2게임 블루 선공
- 각 게임마다 레드/블루 10분 보드게임 타이머
- 빈칸 없이 붙은 5개 연결 승리
- 샌드위치 규칙
- 더블 샌드위치는 제외

## GitHub Pages 배포

이 저장소를 GitHub에 올린 뒤:

1. GitHub 저장소의 `Settings`로 이동
2. `Pages` 메뉴 선택
3. `Build and deployment`에서 `Deploy from a branch` 선택
4. Branch를 `main`, 폴더를 `/root`로 선택
5. 저장 후 제공되는 Pages URL로 접속

