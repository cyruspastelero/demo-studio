export type CompiledCheck = ((data: unknown) => boolean) & { errors?: object[] | null };
export function fromCheck(check: CompiledCheck): (data: unknown) => string[];
export function makeValidator(schema: unknown): (data: unknown) => string[];
