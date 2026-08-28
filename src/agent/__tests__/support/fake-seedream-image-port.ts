import type {
  GenerateDesignImageInput,
  GenerateDesignImageResult,
} from "../../ports";

export interface SeedreamImagePortFakeContract {
  generate(
    input: GenerateDesignImageInput,
    signal?: AbortSignal,
  ): Promise<GenerateDesignImageResult>;
}

export class FakeSeedreamImagePort implements SeedreamImagePortFakeContract {
  readonly calls: Array<{
    input: GenerateDesignImageInput;
    signal?: AbortSignal;
  }> = [];

  constructor(
    private readonly result: GenerateDesignImageResult = {
      ok: true,
      url: "https://tos.example/generated/fake-seedream.png",
    },
  ) {}

  async generate(
    input: GenerateDesignImageInput,
    signal?: AbortSignal,
  ): Promise<GenerateDesignImageResult> {
    this.calls.push({ input, signal });
    if (signal?.aborted) {
      throw signal.reason;
    }
    return this.result;
  }
}
