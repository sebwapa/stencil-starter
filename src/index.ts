/* eslint-disable react/jsx-closing-bracket-location */
/* eslint-disable react/jsx-one-expression-per-line */
/* eslint-disable react/jsx-indent */
/* eslint-disable react/jsx-handler-names */
import {
  Component,
  Host,
  h,
  State,
  Prop,
  Watch,
  Event,
  EventEmitter,
  ComponentInterface,
  Method,
  JSX,
} from "@stencil/core";
import { Option } from "./fwl-custom-select.interface";
import { PackageVersion } from "./../../utils/packageVersion";

function isIosDevice() {
  return (
    typeof navigator !== "undefined" &&
    !!(
      navigator.userAgent.match(/(iPod|iPhone|iPad)/g) &&
      navigator.userAgent.match(/AppleWebKit/g)
    )
  );
}

const isIos = isIosDevice();

const SelectActions = {
  Close: 0,
  CloseSelect: 1,
  First: 2,
  Last: 3,
  Next: 4,
  Open: 5,
  PageDown: 6,
  PageUp: 7,
  Previous: 8,
  Select: 9,
  Type: 10,
};

const getActionFromKey = ({ key, altKey, ctrlKey, metaKey }, isMenuOpened) => {
  const openKeys = ["ArrowDown", "ArrowUp", "Enter", " "];
  if (!isMenuOpened && openKeys.includes(key)) {
    return SelectActions.Open;
  }

  if (key === "Home") {
    return SelectActions.First;
  }
  if (key === "End") {
    return SelectActions.Last;
  }

  // TODO: typing
  if (
    key === "Backspace" ||
    key === "Clear" ||
    (key.length === 1 && key !== " " && !altKey && !ctrlKey && !metaKey)
  ) {
    return SelectActions.Type;
  }

  if (!isMenuOpened) {
    return;
  }

  // handle keys when open
  if (key === "ArrowUp" && altKey) {
    return SelectActions.CloseSelect;
  } else if (key === "ArrowDown" && !altKey) {
    return SelectActions.Next;
  } else if (key === "ArrowUp") {
    return SelectActions.Previous;
  } else if (key === "PageUp") {
    return SelectActions.PageUp;
  } else if (key === "PageDown") {
    return SelectActions.PageDown;
  } else if (key === "Escape") {
    return SelectActions.Close;
  } else if (key === "Enter" || key === " ") {
    return SelectActions.CloseSelect;
  }
};

const getUpdatedIndex = (currentIndex, maxIndex, action) => {
  const pageSize = 10;

  switch (action) {
    case SelectActions.First:
      return 0;
    case SelectActions.Last:
      return maxIndex;
    case SelectActions.Previous:
      return Math.max(0, currentIndex - 1);
    case SelectActions.Next:
      return Math.min(maxIndex, currentIndex + 1);
    case SelectActions.PageUp:
      return Math.max(0, currentIndex - pageSize);
    case SelectActions.PageDown:
      return Math.min(maxIndex, currentIndex + pageSize);
    default:
      return currentIndex;
  }
};

const isOptionVisible = (element, parentEl) => {
  const el = element.getBoundingClientRect();
  const parent = parentEl.getBoundingClientRect();

  const isVisible = el.top >= parent.top && el.bottom <= parent.bottom;

  return isVisible;
};

@Component({
  tag: "fwl-custom-select",
  styleUrl: "fwl-custom-select.scss",
  shadow: true,
})
export class FwlCustomSelect implements ComponentInterface {
  // private counter = 0;
  /**
   * This will be displayed as placeholder in input search box
   */
  @Prop() placeholder!: string;

  /**
   * This is the value of custom select component
   */
  @Prop({ mutable: true }) value = "";

  /**
   * This message will be displayed when there are no matching options for entered input
   */
  @Prop() noResultMessage!: string;

  /**
   * This message will be displayed when wrong option text entered in input
   */
  @Prop() errorMsg!: string;

  /**
   * This a11y text message when focus over input box
   */
  @Prop() allytext = "";

  /**
   * This flag is used to decide whether to select dropdown can do filtering or use as normal
   */
  @Prop() filterOption = false;

  /**
   * Specifies mandatory flag for FwlCustomSelect
   */
  @Prop() required: boolean;

  /**
   * This flag is used for check valid option text entered in input
   */
  @State() valid = true;

  // @State() logs = [];

  // private addLog(msg: string) {
  //   const tmp = [...this.logs.slice(-4)];
  //   tmp.push(msg);
  //   this.logs = tmp;
  // }

  /**
   * This flag is used to decide whether to select dropdown in expanded or collapsed state
   */
  @State() displayOptions = false;

  /**
   * This flag is used to decide whether down arrow key is used first time from textInput
   */
  @State() keyDownEventOptions = false;

  @State() query = "";

  /**
   * These options will be displayed in list
   */
  @Prop() options: Option[] = [];

  /**
   * Defines a string value that labels an error icon
   */
  @Prop() iconAccessibleLabel = "Error";

  /**
   * Used to hide icon for assistive technologies
   */
  @Prop() iconHidden = false;

  /**
   * This array is used to store filtered options based on input in inpiut box
   */
  @State() filteredOptions: Option[] = [];

  /**
   * This event will be published when value of component is changed.
   */
  @Event({ bubbles: false }) changeValue: EventEmitter<string>;

  @Watch("value")
  protected valueChanged(): void {
    this.changeValue.emit(this.value.toString());
    const options = this.options;
    const selectedOption = options.find((x) => x.value === this.value);
    if (this.filterOption) {
      if (selectedOption.label !== this.query) {
        this.query = selectedOption.label;
      }
    }
    if (this.required) {
      this.valid = selectedOption !== undefined ? true : false;
    } else {
      this.valid = true;
    }
  }

  private comboEl: HTMLElement; // non-filterable element
  private listboxEl: HTMLElement; // non-filterable and filterable element (ul)
  private hiddenButtonEl: HTMLElement; //

  @State() activeIndex = 0;
  @State() open = false;
  private ignoreBlur = false;
  private ignoreFocus = false;

  /**
   * This method is used to set selected value.
   */
  @Method()
  async setValue(value: string): Promise<void> {
    this.value = value;
  }

  private onOptionChange = (index) => {
    this.activeIndex = index;

    const elOptions = this.listboxEl.querySelectorAll("[role=option]");
    if (
      elOptions[index] &&
      !isOptionVisible(elOptions[index], this.listboxEl)
    ) {
      elOptions[index].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  private updateMenuState = (open, callFocus = true) => {
    if (this.open === open) {
      return;
    }
    this.open = open;

    callFocus && this.comboEl.focus();
  };

  private selectOption = (index: number) => {
    this.activeIndex = index;
    const selected = this.getOptions()[index] ?? false;
    if (selected) {
      this.value = selected.value;
    }
  };

  private updateQueryByOptionIndex = (index: number) => {
    const selected = this.getOptions()[index] ?? false;
    if (selected) {
      this.query = selected.label;
    }
  };

  private onComboBlur = (e) => {
    const comboContains = this.comboEl.contains(e.relatedTarget);
    const listContains = this.listboxEl.contains(e.relatedTarget);
    const clickedInside = comboContains || listContains;
    if (clickedInside) {
      return;
    }
    if (this.ignoreBlur) {
      this.ignoreBlur = false;
      return;
    }
    if (this.open) {
      this.selectOption(this.activeIndex);
      this.updateMenuState(false, false);
    }
    const selectedOptionIndex = this.options.findIndex(
      (x) => x.value === this.value
    );
    if (this.required && selectedOptionIndex < 0) {
      this.valid = false;
    } else {
      this.valid = true;
    }
  };

  private onComboClick = () => {
    this.updateMenuState(!this.open, false);
  };

  private onComboKeyDown = (e) => {
    const max = this.getOptions().length - 1;

    const action = getActionFromKey(e, this.open);

    switch (action) {
      case SelectActions.Last:
      case SelectActions.First:
        this.updateMenuState(true);
        e.preventDefault();
        this.onOptionChange(getUpdatedIndex(this.activeIndex, max, action));
        break;
      case SelectActions.Next:
      case SelectActions.Previous:
      case SelectActions.PageUp:
      case SelectActions.PageDown:
        e.preventDefault();
        this.onOptionChange(getUpdatedIndex(this.activeIndex, max, action));
        break;
      case SelectActions.CloseSelect:
        e.preventDefault();
        this.selectOption(this.activeIndex);
        this.updateMenuState(false);
        this.updateQueryByOptionIndex(this.activeIndex);
        break;
      case SelectActions.Close:
        e.preventDefault();
        this.updateMenuState(false);
        break;
      case SelectActions.Type:
        // TODO: keyboard search feature
        break;
      case SelectActions.Open:
        e.preventDefault();
        this.updateMenuState(true);
    }
  };

  private onOptionClick = (e) => (optionValue) => {
    e.stopPropagation();
    const index = this.getOptions().findIndex((x) => x.value === optionValue);
    if (isIos) {
      this.ignoreFocus = true;
    }

    if (this.filterOption) {
      if (isIos) {
        this.comboEl.focus();
        setTimeout(() => {
          this.selectOption(index);
          this.updateQueryByOptionIndex(index);
          this.updateMenuState(false, false);
        }, 100);
      } else {
        this.selectOption(index);
        this.updateQueryByOptionIndex(index);
        this.hiddenButtonEl.focus();
        setTimeout(() => {
          this.comboEl.focus();
          this.updateMenuState(false, false);
        }, 100);
      }
    } else {
      if (isIos) {
        this.comboEl.focus();
        this.selectOption(index);
        setTimeout(() => {
          this.updateMenuState(false, false);
        }, 100);
      } else {
        this.selectOption(index);
        this.updateMenuState(false);
      }
    }
  };

  private onOptionKeyDown = (e) => (optionValue) => {
    const { key } = e;
    if (key === "Enter") {
      this.onOptionClick(e)(optionValue);
    } else if (key === "Escape") {
      e.preventDefault();
      this.ignoreFocus = true;
      this.updateMenuState(false, true);
    }
  };

  private onOptionMouseDown = () => {
    this.ignoreBlur = true;
  };

  private onComboboxKeyDown = (e) => {
    this.onComboKeyDown(e);
  };

  private onComboboxClick = () => {
    this.updateMenuState(true, false);
  };

  private onComboboxFocus = () => {
    if (this.ignoreFocus) {
      this.ignoreFocus = false;
      return;
    }
    this.updateMenuState(true, false);
  };

  private onComboboxBlur = (e) => {
    if (this.ignoreBlur) {
      this.ignoreBlur = false;
      return;
    }
    const comboContains = this.comboEl.contains(e.relatedTarget);
    const listContains = this.listboxEl.contains(e.relatedTarget);
    const helperContains = this.hiddenButtonEl.contains(e.relatedTarget);
    const clickedInside = comboContains || listContains || helperContains;

    if (clickedInside) {
      return;
    }

    if (this.open) {
      this.updateMenuState(false, false);
    }
    const options = this.options;
    const selectedOptionIndex = options.findIndex(
      (x) => x.value === this.value
    );
    if (selectedOptionIndex >= 0) {
      this.query = this.options[selectedOptionIndex].label;
    } else {
      this.query = "";
    }
    if (selectedOptionIndex < 0 && this.required) {
      this.valid = false;
    }
  };

  private onOptionBlur = (e) => {
    const comboContains = this.comboEl.contains(e.relatedTarget);
    const listContains = this.listboxEl.contains(e.relatedTarget);
    const helperContains = this.hiddenButtonEl
      ? this.hiddenButtonEl.contains(e.relatedTarget)
      : false;
    const clickedInside = comboContains || listContains || helperContains;

    if (clickedInside) {
      return;
    }

    if (this.open) {
      this.updateMenuState(false, false);
    }
    const options = this.options;
    const selectedOptionIndex = options.findIndex(
      (x) => x.value === this.value
    );
    if (this.filterOption) {
      if (selectedOptionIndex >= 0) {
        this.query = this.options[selectedOptionIndex].label;
      } else {
        this.query = "";
      }
    }

    if (selectedOptionIndex < 0 && this.required) {
      this.valid = false;
    }
  };

  private onComboboxInput = (e) => {
    this.query = e.target.value;
    this.activeIndex = 0;
    this.updateMenuState(true, false);
  };

  private getOptions = () => {
    if (this.filterOption && this.query !== "") {
      return this.options.filter((x) =>
        x.label.toLowerCase().includes(this.query.toLowerCase())
      );
    }
    return this.options;
  };

  render(): JSX.Element {
    const selectedItem = this.getOptions().find((x) => x.value === this.value);
    const isSelected = !!selectedItem;
    const visibleOptions = this.getOptions();

    let activeDescValue = "";
    if (this.open && this.activeIndex >= 0) {
      activeDescValue = `option-${this.activeIndex}`;
    }

    return (
      <Host version={PackageVersion.getpackageVersion()}>
        <fwl-status
          statusData={{
            numberOfElements: visibleOptions.length,
            selectedItemLabel: selectedItem ? selectedItem.label : "",
            opened: this.open,
          }}
        ></fwl-status>
        {!this.filterOption && (
          <div
            aria-activedescendant={activeDescValue}
            aria-controls="listbox1"
            aria-describedby={this.valid ? null : "inline-error-message"}
            aria-expanded={this.open ? "true" : "false"}
            aria-haspopup="listbox"
            aria-label={`${this.allytext} ${this.valid ? "" : this.errorMsg}`}
            class={`fwl-custom-select ${
              !this.valid && "fwl-custom-select--invalid"
            }`}
            id="combo1"
            onBlur={this.onComboBlur}
            onClick={this.onComboClick}
            onKeyDown={this.onComboKeyDown}
            ref={(el) => (this.comboEl = el)}
            role="combobox"
            tabindex="0"
          >
            {isSelected && (
              <div class="fwl-custom-select__combo-label">
                {selectedItem.label}
              </div>
            )}
            {!isSelected && (
              <div class="fwl-custom-select__combo-label">
                {this.placeholder}
              </div>
            )}
            <fwl-icon
              aria-hidden="true"
              class={
                !this.open
                  ? "fwl-custom-select__icon fwl-custom-select__icon--down"
                  : "fwl-custom-select__icon"
              }
              size={18}
              tabindex="-1"
              type="chevrondown"
            ></fwl-icon>
          </div>
        )}
        {this.filterOption && (
          <div class="fwl-custom-select__input-wrapper">
            <input
              aria-activedescendant={activeDescValue}
              aria-autocomplete="both"
              aria-controls="listbox1"
              aria-describedby={this.valid ? null : "inline-error-message"}
              aria-expanded={this.open ? "true" : "false"}
              aria-haspopup="listbox"
              aria-label={`${this.allytext} ${this.valid ? "" : this.errorMsg}`}
              class={`fwl-custom-select fwl-custom-select__combo-input ${
                !this.valid && "fwl-custom-select--invalid"
              }`}
              id="combo1"
              onBlur={this.onComboboxBlur}
              onClick={this.onComboboxClick}
              onFocus={this.onComboboxFocus}
              onInput={this.onComboboxInput}
              onKeyDown={this.onComboboxKeyDown}
              ref={(el) => (this.comboEl = el)}
              role="combobox"
              type="text"
              value={this.query}
            />
            <div class="fwl-custom-select__input-separator" />
            <button
              aria-hidden="true"
              aria-label="item selected"
              class="hidden-button"
              ref={(el) => (this.hiddenButtonEl = el)}
            ></button>
            <fwl-icon
              aria-hidden="true"
              class={
                this.open
                  ? "fwl-custom-select__input-wrapper-icon"
                  : "fwl-custom-select__input-wrapper-icon fwl-custom-select__icon--down"
              }
              size={18}
              tabindex="-1"
              type="chevrondown"
            ></fwl-icon>
          </div>
        )}
        <ul
          class={
            "fwl-custom-select__options-container" +
            (!this.open ? " fwl-custom-select__options-container--hide" : "")
          }
          id="listbox1"
          ref={(el) => (this.listboxEl = el)}
          role="listbox"
        >
          {visibleOptions.map((option, index) => {
            let optionClass = "fwl-custom-select__option";
            if (option === selectedItem) {
              optionClass += " fwl-custom-select__option--selected";
            }
            if (index === this.activeIndex) {
              optionClass += " fwl-custom-select__option--active";
            }
            return (
              <li
                aria-posinset={index}
                aria-selected={option === selectedItem ? "true" : "false"}
                aria-setsize={visibleOptions.length}
                class={optionClass}
                id={`option-${index}`}
                onBlur={(e) => this.onOptionBlur(e)}
                onClick={(e) => this.onOptionClick(e)(option.value)}
                onKeyDown={(e) => this.onOptionKeyDown(e)(option.value)}
                onMouseDown={this.onOptionMouseDown}
                role="option"
                tabindex="-1"
              >
                {option.label}
                <span class="hidden-button">
                  {" "}
                  {isIos ? `${index + 1} of ${visibleOptions.length}` : ""}
                </span>
              </li>
            );
          })}
          {visibleOptions.length === 0 && (
            <li class="fwl-custom-select__option--no-result">
              {this.noResultMessage}
            </li>
          )}
        </ul>
        <div role="alert">
          {!this.valid && (
            <div
              class="fwl-custom-select__inline-error"
              id="inline-error-message"
            >
              <fwl-icon
                class="fwl-custom-select__error-icon"
                describedBy="fwl-custom-select-error-message"
                iconAccessibleLabel={this.iconAccessibleLabel}
                isAriaHidden={this.iconHidden ? "true" : "false"}
                isFocusable="false"
                size={18}
                type="statuserrorlight"
              ></fwl-icon>
              <div
                class="fwl-custom-select__error-msg"
                id="fwl-custom-select-error-message"
              >
                {this.errorMsg}
              </div>
            </div>
          )}
        </div>
      </Host>
    );
  }
}
