// 画面の切り替えとテストの動き
// 記録は保存しません（ページを閉じるとリセットされます）

const app = document.getElementById("app");
const ALL_TERMS = SECTIONS.flatMap(s => s.terms.map(term => ({ ...term, sectionId: s.id })));

// このページを開いている間だけ使う進捗（保存はしない）
const progress = {}; // { s1: { best: 4, total: 5 } }

// ---------- 小さな道具 ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === "class") node.className = val;
    else if (key === "onclick") node.addEventListener("click", val);
    else if (val !== undefined && val !== null) node.setAttribute(key, val);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function render(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function findSection(id) {
  return SECTIONS.find(s => s.id === id);
}

// ---------- 問題づくり ----------
// pool: 出題する用語の候補 / distractorPool: 不正解の選択肢を選ぶ候補
function buildQuiz(pool, count, distractorPool) {
  return shuffle(pool).slice(0, count).map(answer => {
    const others = shuffle(distractorPool.filter(t => t.t !== answer.t)).slice(0, 3);
    const choices = shuffle([answer, ...others]);
    const askTerm = Math.random() < 0.5; // 半分は「説明→用語」、半分は「用語→説明」
    return {
      answer,
      prompt: askTerm ? "次の説明に当てはまる用語はどれ？" : `「${answer.t}」の意味として正しいものはどれ？`,
      body: askTerm ? answer.d : null,
      choices: choices.map(c => ({ label: askTerm ? c.t : c.d, correct: c.t === answer.t })),
      picked: null
    };
  });
}

// ---------- ホーム ----------
function homeView() {
  const doneCount = Object.keys(progress).length;
  const cards = SECTIONS.map((s, i) => {
    const p = progress[s.id];
    return el("button", { class: "section-card", onclick: () => go(`#/study/${s.id}`) },
      el("span", { class: "section-no" }, String(i + 1).padStart(2, "0")),
      el("span", { class: "section-text" },
        el("strong", {}, s.title),
        el("small", {}, s.lead)
      ),
      el("span", { class: p ? "badge done" : "badge" }, p ? `${p.best}/${p.total}` : `${s.terms.length}語`)
    );
  });

  render(
    el("header", { class: "hero" },
      el("p", { class: "eyebrow" }, "セラピストのためのCodex超入門"),
      el("h1", {}, "IT・生成AI 基礎用語", el("br"), "チェック"),
      el("p", { class: "hero-lead" }, `${SECTIONS.length}つのセクションで${ALL_TERMS.length}語を学び、最後に総合テストに挑戦しましょう。`)
    ),
    el("main", { class: "container wide" },
      el("h2", { class: "label" }, "セクションを選ぶ"),
      el("div", { class: "section-list" }, cards),
      el("div", { class: "final-box" },
        el("div", {},
          el("strong", {}, "総合テスト"),
          el("small", {}, `全${ALL_TERMS.length}語からランダムに${QUIZ_CONFIG.finalQuestions}問・${QUIZ_CONFIG.passScore}問以上で修了証`)
        ),
        el("button", { class: "btn primary", onclick: () => go("#/final") }, "挑戦する")
      ),
      el("p", { class: "note" }, `確認テスト済み：${doneCount} / ${SECTIONS.length}　※記録は保存されません`)
    )
  );
}

// ---------- 用語の学習 ----------
function studyView(sectionId) {
  const s = findSection(sectionId);
  if (!s) return go("#/");
  const index = SECTIONS.indexOf(s);

  const cards = s.terms.map((term, i) =>
    el("article", { class: "term-card" },
      el("div", { class: "term-head" },
        el("span", { class: "term-no" }, i + 1),
        el("div", {},
          el("h3", {}, term.t),
          term.r ? el("p", { class: "reading" }, term.r) : null
        )
      ),
      el("p", { class: "term-def" }, term.d),
      el("p", { class: "term-ex" }, el("span", { class: "tag" }, "現場では"), term.x)
    )
  );

  render(
    topBar(`SECTION ${String(index + 1).padStart(2, "0")}`),
    el("main", { class: "container wide" },
      el("h1", { class: "page-title" }, s.title),
      el("p", { class: "page-lead" }, s.lead),
      el("div", { class: "term-list" }, cards),
      el("div", { class: "sticky-cta" },
        el("button", { class: "btn primary block", onclick: () => go(`#/quiz/${s.id}`) },
          `確認テスト（${QUIZ_CONFIG.sectionQuestions}問）へ進む`)
      )
    )
  );
}

// ---------- テスト ----------
let quizState = null;

function startQuiz(mode, sectionId) {
  if (mode === "section") {
    const s = findSection(sectionId);
    if (!s) return go("#/");
    quizState = {
      mode, sectionId, title: s.title,
      questions: buildQuiz(s.terms, QUIZ_CONFIG.sectionQuestions, s.terms),
      current: 0
    };
  } else {
    quizState = {
      mode, title: "総合テスト",
      questions: buildQuiz(ALL_TERMS, QUIZ_CONFIG.finalQuestions, ALL_TERMS),
      current: 0
    };
  }
  questionView();
}

function questionView() {
  const q = quizState.questions[quizState.current];
  const total = quizState.questions.length;
  const answered = q.picked !== null;

  const choiceButtons = q.choices.map((c, i) => {
    let cls = "choice";
    if (answered) {
      if (c.correct) cls += " correct";
      else if (i === q.picked) cls += " wrong";
      else cls += " dim";
    }
    return el("button", {
      class: cls,
      disabled: answered ? "" : null,
      onclick: () => { q.picked = i; questionView(); }
    }, el("span", { class: "choice-mark" }, "ABCD"[i]), el("span", {}, c.label));
  });

  let feedback = null;
  if (answered) {
    const ok = q.choices[q.picked].correct;
    feedback = el("div", { class: ok ? "feedback ok" : "feedback ng" },
      el("strong", {}, ok ? "正解！" : `不正解　正解は「${q.answer.t}」`),
      el("p", {}, q.answer.d),
      el("p", { class: "feedback-ex" }, q.answer.x)
    );
  }

  const isLast = quizState.current === total - 1;

  render(
    topBar(quizState.title, () => {
      if (confirm("テストを中断してホームに戻りますか？")) go("#/");
    }),
    el("main", { class: "container narrow" },
      el("div", { class: "quiz-progress" },
        el("span", {}, `第${quizState.current + 1}問 / ${total}問`),
        el("div", { class: "bar" }, el("i", { style: `width:${((quizState.current + (answered ? 1 : 0)) / total) * 100}%` }))
      ),
      el("h2", { class: "question" }, q.prompt),
      q.body ? el("p", { class: "question-body" }, q.body) : null,
      el("div", { class: "choices" }, choiceButtons),
      feedback,
      el("p", { class: "kbd-hint" }, "キーボード：1〜4 または A〜D で回答、Enter で次へ"),
      answered
        ? el("button", {
            class: "btn primary block next",
            onclick: () => {
              if (isLast) resultView();
              else { quizState.current++; questionView(); }
            }
          }, isLast ? "結果を見る" : "次の問題へ")
        : null
    )
  );
}

function resultView() {
  const qs = quizState.questions;
  const score = qs.filter(q => q.choices[q.picked].correct).length;
  const total = qs.length;
  const wrong = qs.filter(q => !q.choices[q.picked].correct);
  const isFinal = quizState.mode === "final";
  const passed = isFinal && score >= QUIZ_CONFIG.passScore;

  if (!isFinal) {
    const prev = progress[quizState.sectionId];
    progress[quizState.sectionId] = { best: Math.max(score, prev ? prev.best : 0), total };
  }

  let message;
  if (isFinal) message = passed ? "合格です！修了証を発行できます。" : `合格まであと${QUIZ_CONFIG.passScore - score}問。復習してもう一度挑戦しましょう。`;
  else message = score === total ? "全問正解！次のセクションへ進みましょう。" : "間違えた用語を確認しておきましょう。";

  const review = wrong.length
    ? el("section", { class: "review" },
        el("h2", { class: "label" }, `復習する用語（${wrong.length}）`),
        wrong.map(q => el("article", { class: "term-card compact" },
          el("h3", {}, q.answer.t),
          el("p", { class: "term-def" }, q.answer.d),
          el("p", { class: "term-ex" }, el("span", { class: "tag" }, "現場では"), q.answer.x)
        ))
      )
    : null;

  const sectionIndex = isFinal ? -1 : SECTIONS.findIndex(s => s.id === quizState.sectionId);
  const nextSection = sectionIndex >= 0 ? SECTIONS[sectionIndex + 1] : null;

  const actions = [];
  if (passed) actions.push(el("button", { class: "btn primary block", onclick: certificateFormView }, "修了証を発行する"));
  if (!isFinal && nextSection) actions.push(el("button", { class: "btn primary block", onclick: () => go(`#/study/${nextSection.id}`) }, `次へ：${nextSection.title}`));
  if (!isFinal && !nextSection) actions.push(el("button", { class: "btn primary block", onclick: () => go("#/final") }, "総合テストに挑戦"));
  actions.push(el("button", { class: "btn ghost block", onclick: () => startQuiz(quizState.mode, quizState.sectionId) }, "もう一度テストする"));
  if (!isFinal) actions.push(el("button", { class: "btn ghost block", onclick: () => go(`#/study/${quizState.sectionId}`) }, "用語を見直す"));
  actions.push(el("button", { class: "btn ghost block", onclick: () => go("#/") }, "ホームへ"));

  render(
    topBar(quizState.title),
    el("main", { class: "container narrow" },
      el("div", { class: `score-card ${isFinal ? (passed ? "pass" : "fail") : ""}` },
        el("p", { class: "label" }, "あなたのスコア"),
        el("p", { class: "score" }, el("b", {}, score), ` / ${total}`),
        isFinal ? el("p", { class: "verdict" }, passed ? "合格" : "不合格") : null,
        el("p", {}, message)
      ),
      el("div", { class: "actions" }, actions),
      review
    )
  );
}

// ---------- 修了証 ----------
function certificateFormView() {
  const input = el("input", { type: "text", id: "name", placeholder: "例：山田 花子", maxlength: "30", autocomplete: "name" });
  render(
    topBar("修了証の発行"),
    el("main", { class: "container narrow" },
      el("h1", { class: "page-title" }, "修了証に載せるお名前"),
      el("p", { class: "page-lead" }, "入力したお名前はこの画面の表示にだけ使い、どこにも送信・保存されません。"),
      el("label", { class: "field" }, el("span", {}, "お名前"), input),
      el("button", {
        class: "btn primary block",
        onclick: () => certificateView(input.value.trim() || "受講者")
      }, "修了証を表示")
    )
  );
  input.focus();
}

function certificateView(name) {
  const qs = quizState.questions;
  const score = qs.filter(q => q.choices[q.picked].correct).length;
  const d = new Date();
  const dateText = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

  render(
    topBar("修了証"),
    el("main", { class: "container narrow" },
      el("div", { class: "certificate" },
        el("p", { class: "cert-eyebrow" }, "CERTIFICATE OF COMPLETION"),
        el("h1", {}, "修了証"),
        el("p", { class: "cert-name" }, name, el("span", {}, " 殿")),
        el("p", { class: "cert-body" },
          "あなたは「セラピストのためのCodex超入門」におけるIT・生成AI基礎用語の総合テストに合格したことを証します。"
        ),
        el("p", { class: "cert-score" }, `総合テスト ${score} / ${qs.length} 問正解`),
        el("p", { class: "cert-date" }, dateText),
        el("p", { class: "cert-issuer" }, "セラピストのためのCodex超入門")
      ),
      el("p", { class: "note center" }, "スクリーンショットで保存してください"),
      el("div", { class: "actions" },
        el("button", { class: "btn ghost block", onclick: () => go("#/") }, "ホームへ")
      )
    )
  );
}

// ---------- 共通の上部バー ----------
function topBar(title, onBack) {
  return el("div", { class: "topbar" },
    el("button", { class: "back", "aria-label": "ホームへ戻る", onclick: onBack || (() => go("#/")) }, "‹ ホーム"),
    el("span", {}, title)
  );
}

// ---------- 画面の振り分け ----------
function route() {
  const [, page, id] = location.hash.replace(/^#/, "").split("/");
  if (page === "study") studyView(id);
  else if (page === "quiz") startQuiz("section", id);
  else if (page === "final") startQuiz("final");
  else homeView();
}

// ---------- PC向け：キーボード操作 ----------
// テスト中：1〜4 / A〜D で回答、Enter / → で次へ
document.addEventListener("keydown", e => {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.matches("input, textarea")) return;
  const choices = app.querySelectorAll(".choice");
  if (!choices.length) return;

  const key = e.key.toLowerCase();
  const index = "1234".includes(key) ? Number(key) - 1 : "abcd".indexOf(key);
  if (key.length === 1 && index >= 0 && choices[index] && !choices[index].disabled) {
    e.preventDefault();
    choices[index].click();
    return;
  }
  if (e.key === "Enter" || e.key === "ArrowRight") {
    const next = app.querySelector(".next");
    if (next) {
      e.preventDefault();
      next.click();
    }
  }
});

window.addEventListener("hashchange", route);
route();
