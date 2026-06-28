import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Script, createContext } from "node:vm";

const contentScript = await readFile(join("extension", "content.js"), "utf8");

const minimalFixtureData = {
  title: "Демо теста",
  subject: "Методы решения проблем в информатике",
  question: "Какой подход обычно применяют для поиска кратчайшего пути в графе с неотрицательными весами рёбер?",
  options: [
    "Полный перебор всех перестановок вершин",
    "Алгоритм Дейкстры",
    "Сортировка пузырьком",
    "Метод половинного деления"
  ]
};

class Element {
  constructor(tagName, attributes = {}, text = "") {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.children = [];
    this.parentElement = null;
    this.text = text;
  }
}

const fixture = buildMinimalFixture(minimalFixtureData);
// content.js registers a "selectionchange" listener on init; the mock document
// doesn't need to fire it, just to expose the method.
fixture.document.addEventListener = () => {};
const context = createContext({
  chrome: { runtime: { onMessage: { addListener() {} } } },
  window: {
    CSS: { escape: (value) => String(value).replace(/["\\]/g, "\\$&") },
    URL
  },
  document: fixture.document,
  NodeFilter: {
    SHOW_TEXT: 4,
    FILTER_ACCEPT: 1,
    FILTER_REJECT: 2
  },
  HTMLInputElement: class HTMLInputElement {}
});
context.URL = URL;

context.window.window = context.window;
context.window.document = fixture.document;
context.globalThis = context.window;

new Script(contentScript).runInContext(context);
const result = await context.window.QuizStudyAssistantExtractor.extractQuizContext(fixture.document);

assert(result.isQuizPage, "fixture should be detected as a quiz");
assert(result.question.includes("кратчайшего пути"), "question text should be extracted");
assert(result.options.length === 4, "four answer options should be extracted");
assert(!result.question.includes("Отправить"), "submit button text should not be part of the question");
assert(result.questionSignature, "question fingerprint should be returned");

const imageFixture = buildImageOnlyFixture();
const imageResult = await context.window.QuizStudyAssistantExtractor.extractQuizContext(imageFixture.document);
assert(imageResult.options.length === 2, "image-only options should be extracted");
assert(imageResult.options[0].includes("imgDF11CF6C"), "image option src should be included");

const inputOnlyFixture = buildInputOnlyCheckboxFixture();
const inputOnlyResult = await context.window.QuizStudyAssistantExtractor.extractQuizContext(inputOnlyFixture.document);
assert(inputOnlyResult.options.length === 3, "input-only checkbox options should be numbered");
assert(inputOnlyResult.options[0] === "Вариант 1", "first input-only option should get a placeholder");

const moodleClearChoiceFixture = buildMoodleClearChoiceFixture();
const moodleClearChoiceResult = await context.window.QuizStudyAssistantExtractor.extractQuizContext(moodleClearChoiceFixture.document);
assert(moodleClearChoiceResult.options.length === 6, "Moodle clear-choice radio should not be counted as an answer option");
assert(!moodleClearChoiceResult.options.some((option) => option.includes("Очистить")), "clear-choice label should not be sent as an option");

const audioFixture = buildAudioFixture();
const audioResult = await context.window.QuizStudyAssistantExtractor.extractQuizContext(audioFixture.document);
assert(audioResult.audioSources.length === 1, "audio sources should be extracted");
assert(audioResult.audioSources[0].src === "https://example.test/audio/c1-q31.mp3", "audio source should be absolute");

console.log("extractor smoke test passed");

function buildMinimalFixture({ title, subject, question, options }) {
  const body = new Element("body");
  const main = append(body, new Element("main"));
  append(main, new Element("h1", {}, subject));
  const form = append(main, new Element("form", { class: "quiz", action: "/quiz-submit" }));
  const section = append(form, new Element("section", { class: "que" }));
  append(section, new Element("div", { class: "qtext" }, question));
  const answer = append(section, new Element("div", { class: "answer" }));

  options.forEach((labelText) => {
    const label = append(answer, new Element("label", {}, labelText));
    append(label, new Element("input", { type: "radio", name: "q1" }));
  });

  append(section, new Element("button", { type: "submit" }, "Отправить"));

  const document = {
    title,
    body,
    location: { href: "https://example.test/mod/quiz/attempt.php" },
    defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }) },
    querySelector: (selector) => querySelector(body, selector),
    querySelectorAll: (selector) => querySelectorAll(body, selector),
    createTreeWalker(root, showText, filter) {
      const nodes = [];
      collectTextNodes(root, nodes);
      let index = -1;
      return {
        currentNode: null,
        nextNode() {
          while (++index < nodes.length) {
            const node = nodes[index];
            if (filter.acceptNode(node) === 1) {
              this.currentNode = node;
              return true;
            }
          }
          return false;
        }
      };
    }
  };

  attachDocument(body, document);
  return { document };
}

function buildImageOnlyFixture() {
  const body = new Element("body");
  const main = append(body, new Element("main"));
  const section = append(main, new Element("section", { class: "que" }));
  append(section, new Element("div", { class: "qtext" }, "Выберите выражение, равное производной функции."));
  const answer = append(section, new Element("div", { class: "answer" }));

  [
    "https://edu.rosdistant.ru/pluginfile.php/169882/question/answer/11295208/5/11115020/imgDF11CF6C-C769-4DAC-A4C7-280A830FF510_1.jpg",
    "https://edu.rosdistant.ru/pluginfile.php/169882/question/answer/11295208/5/11115021/imgC7CF49C6-9D8E-4670-91C3-C98C5A_1.jpg"
  ].forEach((src, index) => {
    const label = append(answer, new Element("label", { id: `q11295208:5_answer${index}_label` }));
    append(label, new Element("input", { type: "radio", name: "q1", id: `q11295208:5_answer${index}` }));
    append(label, new Element("img", { src, width: "66", height: "25" }));
  });

  const document = createDocument(body, "Image options", "https://example.test/mod/quiz/attempt.php");
  attachDocument(body, document);
  return { document };
}

function buildInputOnlyCheckboxFixture() {
  const body = new Element("body");
  const main = append(body, new Element("main"));
  const section = append(main, new Element("section", { class: "que" }));
  append(section, new Element("div", { class: "qtext" }, "Выберите все подходящие варианты."));
  const answer = append(section, new Element("div", { class: "answer" }));

  for (let index = 0; index < 3; index += 1) {
    append(answer, new Element("input", { type: "checkbox", name: "q1", id: `choice-${index}` }));
  }

  const document = createDocument(body, "Input-only options", "https://example.test/mod/quiz/attempt.php");
  attachDocument(body, document);
  return { document };
}

function buildMoodleClearChoiceFixture() {
  const body = new Element("body");
  const main = append(body, new Element("main"));
  const form = append(main, new Element("form", { class: "quiz", action: "/mod/quiz/processattempt.php" }));
  const section = append(form, new Element("section", { class: "que" }));
  append(section, new Element("div", { class: "qtext" }, "Выберите правильную очерёдность перечисленных этапов."));
  const answer = append(section, new Element("div", { class: "answer" }));

  ["E, A, B, C, D", "D, C, E, A, B", "C, B, E, D, A", "C, E, A, B, D", "C, B, D, A, E", "E, A, C, D, B"]
    .forEach((labelText, index) => {
      const row = append(answer, new Element("div", { class: index % 2 === 0 ? "r0" : "r1" }));
      append(row, new Element("input", { type: "radio", name: "q1", value: String(index), id: `answer-${index}` }));
      append(row, new Element("label", { for: `answer-${index}` }, labelText));
    });

  const clearChoice = append(answer, new Element("div", { class: "qtype_multichoice_clearchoice" }));
  append(clearChoice, new Element("input", {
    type: "radio",
    name: "q1",
    id: "answer--1",
    value: "-1",
    class: "sr-only",
    "aria-hidden": "true",
    disabled: ""
  }));
  append(clearChoice, new Element("label", { for: "answer--1" }, "Очистить мой выбор"));

  const document = createDocument(body, "Moodle clear choice", "https://example.test/mod/quiz/attempt.php");
  attachDocument(body, document);
  return { document };
}

function buildAudioFixture() {
  const body = new Element("body");
  const main = append(body, new Element("main"));
  const section = append(main, new Element("section", { class: "que" }));
  append(section, new Element("div", { class: "qtext" }, "Welche Schlussfolgerung zieht der Sprecher implizit?"));
  const audio = append(section, new Element("audio", { controls: "" }));
  append(audio, new Element("source", { src: "/audio/c1-q31.mp3", type: "audio/mpeg" }));
  const answer = append(section, new Element("div", { class: "answer" }));
  ["A", "B", "C", "D"].forEach((labelText, index) => {
    const label = append(answer, new Element("label", {}, labelText));
    append(label, new Element("input", { type: "radio", name: "answer", value: labelText, id: `audio-answer-${index}` }));
  });

  const document = createDocument(body, "Audio fixture", "https://example.test/de/test/c1");
  attachDocument(body, document);
  return { document };
}

function createDocument(body, title, href) {
  return {
    title,
    body,
    location: { href },
    defaultView: { getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }) },
    querySelector: (selector) => querySelector(body, selector),
    querySelectorAll: (selector) => querySelectorAll(body, selector),
    createTreeWalker(root, showText, filter) {
      const nodes = [];
      collectTextNodes(root, nodes);
      let index = -1;
      return {
        currentNode: null,
        nextNode() {
          while (++index < nodes.length) {
            const node = nodes[index];
            if (filter.acceptNode(node) === 1) {
              this.currentNode = node;
              return true;
            }
          }
          return false;
        }
      };
    }
  };
}

function append(parent, child) {
  child.parentElement = parent;
  parent.children.push(child);
  return child;
}

function attachDocument(element, document) {
  element.ownerDocument = document;
  element.closest = (selector) => closest(element, selector);
  element.querySelector = (selector) => querySelector(element, selector);
  element.querySelectorAll = (selector) => querySelectorAll(element, selector);
  element.cloneNode = () => element;
  element.remove = () => {};
  element.getAttribute = (name) => Object.prototype.hasOwnProperty.call(element.attributes, name) ? element.attributes[name] : null;
  element.id = element.attributes.id || "";
  element.value = element.attributes.value || "";
  element.src = element.attributes.src || "";
  element.className = element.attributes.class || "";
  element.disabled = Object.prototype.hasOwnProperty.call(element.attributes, "disabled");
  for (const child of element.children) {
    attachDocument(child, document);
  }
}

function collectTextNodes(element, nodes) {
  if (element.text) {
    nodes.push({ nodeValue: element.text, parentElement: element });
  }
  for (const child of element.children) {
    collectTextNodes(child, nodes);
  }
}

function querySelector(root, selector) {
  return querySelectorAll(root, selector)[0] || null;
}

function querySelectorAll(root, selector) {
  const selectors = selector.split(",").map((part) => part.trim());
  const elements = [];
  visit(root, (element) => {
    if (selectors.some((item) => matches(element, item))) {
      elements.push(element);
    }
  });
  return elements;
}

function visit(element, callback) {
  callback(element);
  for (const child of element.children) {
    visit(child, callback);
  }
}

function closest(element, selector) {
  let current = element;
  while (current) {
    if (selector.split(",").some((item) => matches(current, item.trim()))) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function matches(element, selector) {
  if (!selector) return false;
  if (selector === "main") return element.tagName === "MAIN";
  if (selector === "section") return element.tagName === "SECTION";
  if (selector === "article") return element.tagName === "ARTICLE";
  if (selector === "form") return element.tagName === "FORM";
  if (selector === "label") return element.tagName === "LABEL";
  if (selector === "li") return element.tagName === "LI";
  if (selector === "p") return element.tagName === "P";
  if (selector === "div") return element.tagName === "DIV";
  if (selector === "button") return element.tagName === "BUTTON";
  if (selector === "img") return element.tagName === "IMG";
  if (selector === "audio") return element.tagName === "AUDIO";
  if (selector === "video") return element.tagName === "VIDEO";
  if (selector === "source") return element.tagName === "SOURCE";
  if (selector === "h1") return element.tagName === "H1";
  if (selector === "h2") return element.tagName === "H2";
  if (selector === "h3") return element.tagName === "H3";
  if (selector === "legend") return element.tagName === "LEGEND";
  if (selector.startsWith(".")) return hasClass(element, selector.slice(1));
  if (/^\.[\w-]+$/.test(selector)) return hasClass(element, selector.slice(1));
  if (selector === "input[type='radio']") return element.tagName === "INPUT" && element.attributes.type === "radio";
  if (selector === "input[type='checkbox']") return element.tagName === "INPUT" && element.attributes.type === "checkbox";
  if (selector === "input[type='submit']") return element.tagName === "INPUT" && element.attributes.type === "submit";
  if (selector === "form[action*='quiz']") return element.tagName === "FORM" && /quiz/.test(element.attributes.action || "");
  if (selector.includes("[class*='question']")) return /question/.test(element.attributes.class || "");
  if (selector.includes("[id*='question']")) return /question/.test(element.attributes.id || "");
  if (selector.includes("[class*='qtext']")) return /qtext/.test(element.attributes.class || "");
  if (selector.includes("[class*='questiontext']")) return /questiontext/.test(element.attributes.class || "");
  return false;
}

function hasClass(element, className) {
  return String(element.attributes.class || "").split(/\s+/).includes(className);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
