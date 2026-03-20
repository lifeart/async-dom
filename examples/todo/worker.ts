import { createWorkerDom } from "../../src/worker-thread/index.ts";

const { document } = createWorkerDom();

// -- Styles --
const style = document.createElement("style");
style.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f5f5f5; padding: 40px 20px; }
  .app { max-width: 480px; margin: 0 auto; }
  h1 { font-size: 28px; margin-bottom: 16px; color: #333; }
  .input-row { display: flex; gap: 8px; margin-bottom: 24px; }
  .input-row input {
    flex: 1; padding: 10px 14px; font-size: 16px;
    border: 2px solid #ddd; border-radius: 6px; outline: none;
  }
  .input-row input:focus { border-color: #4a90d9; }
  .input-row button {
    padding: 10px 20px; font-size: 16px; cursor: pointer;
    background: #4a90d9; color: white; border: none; border-radius: 6px;
  }
  .input-row button:hover { background: #3a7bc8; }
  ul { list-style: none; }
  li {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px; background: white; border-radius: 6px;
    margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }
  li.done span { text-decoration: line-through; color: #999; }
  li span { flex: 1; font-size: 16px; }
  li button {
    background: none; border: none; cursor: pointer;
    font-size: 18px; color: #ccc; padding: 4px 8px;
  }
  li button:hover { color: #e74c3c; }
  .count { font-size: 14px; color: #888; margin-top: 16px; }
`;
document.head.appendChild(style);

// -- App shell --
const app = document.createElement("div");
app.classList.add("app");

const title = document.createElement("h1");
title.textContent = "Todo List";
app.appendChild(title);

// Input row
const inputRow = document.createElement("div");
inputRow.classList.add("input-row");

const input = document.createElement("input");
input.setAttribute("type", "text");
input.setAttribute("placeholder", "What needs to be done?");

const addBtn = document.createElement("button");
addBtn.textContent = "Add";

inputRow.append(input, addBtn);
app.appendChild(inputRow);

// Todo list
const list = document.createElement("ul");
app.appendChild(list);

// Item count display
const countDisplay = document.createElement("div");
countDisplay.classList.add("count");
app.appendChild(countDisplay);

document.body.appendChild(app);

// -- State & logic --
let todoId = 0;
const todos: Map<number, { text: string; done: boolean; li: ReturnType<typeof document.createElement> }> = new Map();

function updateCount() {
	const remaining = [...todos.values()].filter((t) => !t.done).length;
	countDisplay.textContent = `${remaining} item${remaining !== 1 ? "s" : ""} remaining`;
}

function addTodo(text: string) {
	if (!text.trim()) return;
	const id = todoId++;

	const li = document.createElement("li");

	// Toggle done on click
	const toggle = document.createElement("input");
	toggle.setAttribute("type", "checkbox");
	toggle.addEventListener("click", () => {
		const todo = todos.get(id);
		if (todo) {
			todo.done = !todo.done;
			li.classList.toggle("done", todo.done);
			updateCount();
		}
	});

	const span = document.createElement("span");
	span.textContent = text;

	// Remove button
	const removeBtn = document.createElement("button");
	removeBtn.textContent = "\u00D7";
	removeBtn.addEventListener("click", () => {
		li.remove();
		todos.delete(id);
		updateCount();
	});

	li.append(toggle, span, removeBtn);
	list.appendChild(li);

	todos.set(id, { text, done: false, li });
	updateCount();
}

function handleAdd() {
	addTodo(input.value);
	input.value = "";
}

addBtn.addEventListener("click", handleAdd);

// Submit on Enter key
input.addEventListener("keydown", (e: unknown) => {
	const event = e as { key?: string };
	if (event.key === "Enter") {
		handleAdd();
	}
});

// Seed a couple of items
addTodo("Try async-dom");
addTodo("Build something cool");

updateCount();
