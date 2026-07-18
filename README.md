# AIS Codex Plugins

Personal, open-source marketplace for reusable Codex plugins.

[English](#english) · [Русский](#русский)

## English

### Plan Mirror

Plan Mirror reviews a technical implementation plan before development starts. It helps turn vague tasks, subjective completion criteria, missing dependencies, and risky assumptions into a clearer, independently verifiable plan.

It is useful when you want to:

- check whether a plan is specific enough to implement;
- compare the plan with confirmed requirements;
- verify plan claims against the current repository without giving the reviewer shell access;
- receive one safely improved candidate instead of only a list of problems;
- keep the original plan unchanged.

Workflow:

```text
confirmed contract → fresh Critic → one Fixer → fresh blind Critic
```

The second Critic does not see the first review. This reduces confirmation bias and independently checks the improved candidate.

### Install

```bash
codex plugin marketplace add andredbird/AIS-codex-plugins --ref v0.1.1
```

Plan Mirror is marked `INSTALLED_BY_DEFAULT`. Restart the ChatGPT desktop app, open a new Codex chat, and run:

```text
$plan-mirror:doctor
```

Then review a plan:

```text
$plan-mirror:review

Review PLAN.md. Confirm the project contract with me first and use repository evidence when the plan depends on existing code.
```

The review creates `candidate.md`, `report.md`, and `result.json` under `.plan-mirror/runs/`. It never overwrites the source plan.

See the [Plan Mirror documentation](plugins/plan-mirror/README.md) for configuration, direct CLI usage, security boundaries, and result statuses.

## Русский

### Plan Mirror

Plan Mirror проверяет технический план до начала разработки. Он помогает превратить расплывчатые задачи, субъективные критерии готовности, пропущенные зависимости и рискованные предположения в более ясный и независимо проверяемый план.

Плагин полезен, когда нужно:

- понять, достаточно ли план конкретен для реализации;
- проверить план относительно подтверждённых требований;
- сопоставить утверждения плана с текущим репозиторием, не выдавая проверяющему shell-доступ;
- получить один безопасно улучшенный вариант, а не только список замечаний;
- гарантированно сохранить исходный план без изменений.

Как он работает:

```text
подтверждённый contract → новый Critic → один Fixer → новый независимый Critic
```

Второй Critic не видит первую проверку. Поэтому он независимо оценивает исправленный план и меньше подвержен подтверждению прежних выводов.

### Установка

```bash
codex plugin marketplace add andredbird/AIS-codex-plugins --ref v0.1.1
```

Plan Mirror помечен `INSTALLED_BY_DEFAULT`. Перезапустите приложение ChatGPT, откройте новый чат Codex и выполните:

```text
$plan-mirror:doctor
```

Затем запустите проверку плана:

```text
$plan-mirror:review

Проверь PLAN.md. Сначала подтверди со мной contract проекта, а если план зависит от существующего кода — используй evidence из репозитория.
```

Результаты сохраняются в `.plan-mirror/runs/`: `candidate.md`, `report.md` и `result.json`. Исходный план никогда не перезаписывается.

Настройка, прямой запуск из терминала, ограничения безопасности и значения итоговых статусов описаны в [документации Plan Mirror](plugins/plan-mirror/README.md).

## Privacy and development / Приватность и разработка

The repository contains reusable prompts, schemas, controller code, and synthetic fixtures only. Do not commit real contracts, review outputs, snapshots, logs, secrets, or personal data.

В репозитории находятся только общие prompts, schemas, код контроллера и синтетические примеры. Не публикуйте реальные contracts, результаты проверок, snapshots, логи, секреты или личные данные.

For local development, add the absolute repository path instead of the GitHub source. Licensed under the [MIT License](LICENSE).
