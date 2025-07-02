import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { createFunctionCallingExecutor } from '@langchain/langgraph/prebuilt';

const DIARY_DIR = path.join(process.cwd(), 'diaries');

async function ensureDir() {
  await fs.mkdir(DIARY_DIR, { recursive: true });
}

function diaryPath(name: string) {
  return path.join(DIARY_DIR, `${name}.txt`);
}

export const createDiary = new DynamicStructuredTool({
  name: 'create_diary',
  description: 'Cria um diário caso ainda não exista',
  schema: z.object({
    name: z.string(),
    initial_entry: z.string().optional()
  }),
  func: async ({ name, initial_entry }) => {
    await ensureDir();
    const file = diaryPath(name);
    try {
      await fs.access(file);
      return { status: 'exists' };
    } catch {
      const content = initial_entry ? `[${new Date().toISOString()}]\n${initial_entry}\n\n` : '';
      await fs.writeFile(file, content);
      return { status: 'created' };
    }
  }
});

export const appendEntry = new DynamicStructuredTool({
  name: 'append_entry',
  description: 'Adiciona uma nova entrada ao diário',
  schema: z.object({
    name: z.string(),
    date_iso: z.string().default(() => new Date().toISOString()),
    content: z.string()
  }),
  func: async ({ name, date_iso, content }) => {
    const file = diaryPath(name);
    const entry = `[${date_iso}]\n${content}\n\n`;
    await fs.appendFile(file, entry);
    return { status: 'ok' };
  }
});

export const readEntries = new DynamicStructuredTool({
  name: 'read_entries',
  description: 'Lê as últimas N entradas do diário',
  schema: z.object({
    name: z.string(),
    limit: z.number().int().min(1).max(50)
  }),
  func: async ({ name, limit }) => {
    const file = diaryPath(name);
    try {
      const text = await fs.readFile(file, 'utf8');
      const entries = text.trim().split(/\n\n+/);
      return entries.slice(-limit).join('\n\n');
    } catch {
      return '';
    }
  }
});

export async function runAgent() {
  const llm = new ChatOpenAI({ modelName: 'gpt-4o-mini' });
  const executor = createFunctionCallingExecutor({
    model: llm,
    tools: [createDiary, appendEntry, readEntries]
  });

  await executor.invoke({
    messages: [{ role: 'system', content: 'Você gerencia um diário chamado "journal".' },
               { role: 'user', content: 'Registre algo sobre hoje.' }]
  });
}

if (require.main === module) {
  runAgent();
}
