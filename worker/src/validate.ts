export { projectDoc } from '@app/collab/schema';
export { applyCommandToYDoc } from '@app/collab/commandAdapter';
export { editCommandSchema, validateCommand, zodErrorToCommandErrors } from '@app/engine/validate';
export type { CommandError, CommandErrorCode } from '@app/engine/validate';
