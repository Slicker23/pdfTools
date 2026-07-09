import { loadPdfDocument, savePdf } from "./core";

export type FormFieldType =
  | "text"
  | "textarea"
  | "password"
  | "checkbox"
  | "dropdown"
  | "option-list"
  | "button"
  | "radio";

export interface FormField {
  type: FormFieldType;
  /** Field or radio-group name */
  name: string;
  page: number;
  /** PDF user-space bottom-left x */
  x: number;
  /** PDF user-space bottom-left y */
  y: number;
  width: number;
  height: number;
  /** Dropdown / list-box choices (one per line in UI) */
  options?: string[];
  /** Checkbox checked state */
  value?: string | boolean;
  /** Button label */
  buttonLabel?: string;
  /** Radio option label within a group */
  radioOption?: string;
  /** Default text or pre-selected dropdown/list value */
  defaultValue?: string;
}

const opts = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

export async function createFormPdf(file: File, fields: FormField[]): Promise<Uint8Array> {
  if (fields.length === 0) {
    throw new Error("Add at least one form field");
  }

  const pdf = await loadPdfDocument(file);
  const form = pdf.getForm();
  const pages = pdf.getPages();

  const radioByGroup = new Map<string, FormField[]>();

  for (const field of fields) {
    const page = pages[field.page - 1];
    if (!page) continue;

    if (field.type === "radio") {
      const group = radioByGroup.get(field.name) ?? [];
      group.push(field);
      radioByGroup.set(field.name, group);
      continue;
    }

    if (field.type === "text" || field.type === "textarea" || field.type === "password") {
      const textField = form.createTextField(field.name);
      textField.addToPage(page, opts(field.x, field.y, field.width, field.height));
      if (field.type === "textarea") textField.enableMultiline();
      if (field.type === "password") textField.enablePassword();
      if (typeof field.defaultValue === "string") textField.setText(field.defaultValue);
    } else if (field.type === "checkbox") {
      const checkBox = form.createCheckBox(field.name);
      checkBox.addToPage(page, opts(field.x, field.y, field.width, field.height));
      if (field.value === true) checkBox.check();
    } else if (field.type === "dropdown" && field.options?.length) {
      const dropdown = form.createDropdown(field.name);
      dropdown.addOptions(field.options);
      dropdown.addToPage(page, opts(field.x, field.y, field.width, field.height));
      if (field.defaultValue && field.options.includes(field.defaultValue)) {
        dropdown.select(field.defaultValue);
      }
    } else if (field.type === "option-list" && field.options?.length) {
      const list = form.createOptionList(field.name);
      list.addOptions(field.options);
      list.addToPage(page, opts(field.x, field.y, field.width, field.height));
      if (field.defaultValue && field.options.includes(field.defaultValue)) {
        list.select(field.defaultValue);
      }
    } else if (field.type === "button") {
      const button = form.createButton(field.name);
      button.addToPage(field.buttonLabel?.trim() || field.name, page, {
        ...opts(field.x, field.y, field.width, field.height),
      });
    }
  }

  for (const [groupName, groupFields] of radioByGroup) {
    if (groupFields.length === 0) continue;
    const radioGroup = form.createRadioGroup(groupName);
    for (const field of groupFields) {
      const page = pages[field.page - 1];
      if (!page) continue;
      const option = field.radioOption?.trim() || field.name;
      radioGroup.addOptionToPage(option, page, opts(field.x, field.y, field.width, field.height));
    }
    const selected = groupFields.find((f) => f.defaultValue)?.defaultValue;
    if (selected) {
      try {
        radioGroup.select(selected);
      } catch {
        // ignore invalid default
      }
    }
  }

  form.updateFieldAppearances();
  return savePdf(pdf);
}

export function createFormFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export const FORM_FIELD_TYPES: { id: FormFieldType; label: string; description: string }[] = [
  { id: "text", label: "Text", description: "Single-line text input" },
  { id: "textarea", label: "Text area", description: "Multi-line text input" },
  { id: "password", label: "Password", description: "Masked text input" },
  { id: "checkbox", label: "Checkbox", description: "On / off toggle" },
  { id: "dropdown", label: "Dropdown", description: "Pick one option from a menu" },
  { id: "option-list", label: "List box", description: "Scrollable list of options" },
  { id: "button", label: "Button", description: "Clickable push button" },
  { id: "radio", label: "Radio button", description: "One choice in a named group" },
];

export function parseOptionsInput(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function defaultFieldSize(type: FormFieldType): { w: number; h: number } {
  switch (type) {
    case "checkbox":
    case "radio":
      return { w: 22, h: 22 };
    case "textarea":
      return { w: 200, h: 80 };
    case "option-list":
      return { w: 200, h: 100 };
    case "button":
      return { w: 120, h: 32 };
    default:
      return { w: 180, h: 28 };
  }
}

export function fieldTypeColor(type: FormFieldType): string {
  switch (type) {
    case "checkbox":
      return "#16a34a";
    case "radio":
      return "#9333ea";
    case "dropdown":
    case "option-list":
      return "#ea580c";
    case "button":
      return "#64748b";
    case "password":
      return "#dc2626";
    case "textarea":
      return "#0891b2";
    default:
      return "#2563eb";
  }
}
