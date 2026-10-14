import fs from 'fs';

let content = fs.readFileSync('src/components/UI/UIManager.js', 'utf8');

const search = `    const stepButtonMap = new Map();
    this.elements.foldStepButtons?.forEach((button) => {
      if (button.dataset.stepIndex) {
        stepButtonMap.set(button.dataset.stepIndex, button);
      }
    });`;

content = content.replace(search, '');

fs.writeFileSync('src/components/UI/UIManager.js', content);
