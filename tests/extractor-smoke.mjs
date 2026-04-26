import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Script, createContext } from "node:vm";

const html = await readFile(join("demo", "quiz.html"), "utf8");
const contentScript = await readFile(join("extension", "content.js"), "utf8");

class Element {
  constructor(tagName, attributes = {}, text = "") {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.children = [];
    this.parentElement = null;
    this.text = text;
  }
}

const fixture = buildMinimalFixture(html);
const context = createContext({
  chrome: { runtime: { onMessage: { addListener() {} } } },
  window: {
    CSS: { escape: (value) => String(value).replace(/["\\]/g, "\\$&") }
  },
  document: fixture.document,
  NodeFilter: {
    SHOW_TEXT: 4,
    FILTER_ACCEPT: 1,
    FILTER_REJECT: 2
  },
  HTMLInputElement: class HTMLInputElement {}
});

context.window.window = context.window;
context.window.document = fixture.document;
context.globalThis = context.window;

new Script(contentScript).runInContext(context);
const result = context.window.QuizStudyAssistantExtractor.extractQuizContext(fixture.document);

assert(result.isQuizPage, "fixture should be detected as a quiz");
assert(result.question.includes("кратчайшего пути"), "question text should be extracted");
assert(result.options.length === 4, "four answer options should be extracted");
assert(!result.question.includes("Отправить"), "submit button text should not be part of the question");

console.log("extractor smoke test passed");

function buildMinimalFixture(sourceHtml) {
  const title = matchText(sourceHtml, /<title>([\s\S]*?)<\/title>/i);
  const subject = matchText(sourceHtml, /<h1>([\s\S]*?)<\/h1>/i);
  const firstQuestionSection = sourceHtml.match(/<section class="que"[\s\S]*?<\/section>/i)?.[0] || sourceHtml;
  const question = matchText(firstQuestionSection, /<div class="qtext">([\s\S]*?)<\/div>/i);
  const labels = [...firstQuestionSection.matchAll(/<label>([\s\S]*?)<\/label>/gi)].map((match) =>
    stripTags(match[1])
  );

  const body = new Element("body");
  const main = append(body, new Element("main"));
  append(main, new Element("h1", {}, subject));
  const form = append(main, new Element("form", { class: "quiz", action: "/demo-submit" }));
  const section = append(form, new Element("section", { class: "que" }));
  append(section, new Element("div", { class: "qtext" }, question));
  const answer = append(section, new Element("div", { class: "answer" }));

  labels.forEach((labelText) => {
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
  element.getAttribute = (name) => element.attributes[name] || null;
  element.id = element.attributes.id || "";
  element.value = element.attributes.value || "";
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
  if (selector === "form") return element.tagName === "FORM";
  if (selector === "label") return element.tagName === "LABEL";
  if (selector === "li") return element.tagName === "LI";
  if (selector === "p") return element.tagName === "P";
  if (selector === "div") return element.tagName === "DIV";
  if (selector === "button") return element.tagName === "BUTTON";
  if (selector === "h1") return element.tagName === "H1";
  if (selector === "h2") return element.tagName === "H2";
  if (selector === "h3") return element.tagName === "H3";
  if (selector === "legend") return element.tagName === "LEGEND";
  if (selector === ".que") return element.attributes.class === "que";
  if (selector === ".qtext") return element.attributes.class === "qtext";
  if (selector === ".answer") return element.attributes.class === "answer";
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

function matchText(value, pattern) {
  return stripTags(value.match(pattern)?.[1] || "");
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
