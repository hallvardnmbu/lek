// js/contestants.js
export class ContestantsManager {
  constructor() {
    this.contestants = [];
    this.setupContestantsUI();
  }

  setupContestantsUI() {
    const container = document.createElement("div");
    container.className = "contestants-container";

    // Add contestant input
    const inputContainer = document.createElement("div");
    inputContainer.className = "contestant-input";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Name";

    const addButton = document.createElement("button");
    addButton.textContent = "Include";
    addButton.addEventListener("click", () => this.addContestant(input.value));

    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.addContestant(input.value);
      }
    });

    inputContainer.appendChild(input);
    inputContainer.appendChild(addButton);
    container.appendChild(inputContainer);

    // Contestants list
    this.list = document.createElement("ul");
    this.list.className = "contestants-list";
    container.appendChild(this.list);

    document.getElementById("contestantsList").appendChild(container);
  }

  addContestant(name) {
    if (name && !this.contestants.includes(name)) {
      this.contestants.push(name);
      this.updateContestantsList();
    }
  }

  removeContestant(name) {
    const index = this.contestants.indexOf(name);
    if (index > -1) {
      this.contestants.splice(index, 1);
      this.updateContestantsList();
    }
  }

  updateContestantsList() {
    this.list.innerHTML = "";
    this.contestants.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      li.addEventListener("click", () => this.removeContestant(name));
      this.list.appendChild(li);
    });
  }

  rigContestant(name) {
    const items = this.list.getElementsByTagName("li");
    for (let item of items) {
      if (item.textContent.toLowerCase() === name.toLowerCase()) {
        item.style.color = "red";
        break;
      }
    }
  }

  unrigAll() {
    const items = this.list.getElementsByTagName("li");
    for (let item of items) {
      item.style.color = "black";
    }
  }
}
