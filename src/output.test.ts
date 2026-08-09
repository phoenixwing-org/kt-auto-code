import { beforeEach, describe, expect, it, vi } from "vitest";

const output = vi.hoisted(() => ({
  appendLine: vi.fn(),
  show: vi.fn(),
  createOutputChannel: vi.fn(),
}));

vi.mock("vscode", () => ({
  window: {
    createOutputChannel: output.createOutputChannel,
  },
}));

import { appendOutputLine, logOutput } from "./output.js";

describe("KT Auto Code output", () => {
  beforeEach(() => {
    output.appendLine.mockReset();
    output.show.mockReset();
    output.createOutputChannel.mockReset();
    output.createOutputChannel.mockReturnValue({
      appendLine: output.appendLine,
      show: output.show,
    });
  });

  it("来源回执只追加不抢焦点，普通日志仍保持既有显示行为", () => {
    appendOutputLine("runtime");
    expect(output.appendLine).toHaveBeenCalledWith("runtime");
    expect(output.show).not.toHaveBeenCalled();

    logOutput("normal");
    expect(output.appendLine).toHaveBeenCalledWith("normal");
    expect(output.show).toHaveBeenCalledWith(true);
  });
});
