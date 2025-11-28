// app/api/quiz/route.ts

import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 180;
import chromium from '@sparticuz/chromium';
import playwright from 'playwright-core';
import axios from 'axios';
import { parse } from 'csv-parse/sync';

// Vercel specific chromium flags
const chromiumFlags = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-gpu'
];

interface QuizPayload {
  url: string;
  secret: string;
}

// Using Next.js App Router, the route handler is exported as a named export
// corresponding to the HTTP method.
// The choice of Node.js and Vercel serverless functions allows for a scalable,
// cost-effective, and easy-to-deploy solution. The serverless architecture
// is well-suited for event-driven tasks like this quiz solver.
export async function POST(req: NextRequest) {
  try {
    const payload: QuizPayload = await req.json();

    // Verify secret
    if (payload.secret !== process.env.MY_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await solveQuiz(payload);
    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
}

async function solveQuiz(payload: QuizPayload): Promise<any> {
  // The use of an external code execution service for Pandas/NumPy is a critical
  // design decision. Vercel's serverless environment has limitations on package
  // size and execution time, making it unsuitable for heavy data analysis.
  // By offloading the Python execution to a dedicated sandbox, we can leverage
  // the power of these libraries without being constrained by the serverless
  // environment.

  // 1. Data Sourcing (Scraping)
  const browser = await playwright.chromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(payload.url);

  // NOTE: The selectors for these elements will need to be adjusted based on
  // the actual structure of the quiz pages. These are placeholders.
  const questionText = await page.locator('h1').innerText();
  const submissionUrl = await page.locator('form').getAttribute('action');
  const dataFileUrl = await page.locator('a[href$=".csv"]').getAttribute('href');

  await browser.close();

  if (!submissionUrl || !dataFileUrl) {
    throw new Error('Could not find submission URL or data file URL');
  }

  // 2. Data Preparation
  const dataResponse = await axios.get(dataFileUrl, { responseType: 'text' });
  const records = parse(dataResponse.data, {
    columns: true,
    skip_empty_lines: true
  });
  const dataString = JSON.stringify(records);

  const maxRetries = 3;
  let retries = 0;
  let submissionResponse;

  while (retries < maxRetries) {
    // 3. LLM Code Generation (AIPipe)
    const aipipeResponse = await axios.post(
      'https://api.aipipe.org/v1/chat/completions',
      {
        model: 'gpt-4', // Or another suitable model
        messages: [
          {
            role: 'system',
            content: "You are an expert Python data analyst. Your ONLY output must be a single, self-contained Python script that solves the quiz. Use Pandas, NumPy, and Matplotlib. **Assume the data is already loaded into a Pandas DataFrame named `df` from a global variable called `DATA_STRING`.** The script MUST define a variable named `FINAL_ANSWER` holding the result (number, boolean, string, JSON, or base64 URI of a generated image for visualization). Do not include any file operations or extra dialogue."
          },
          {
            role: 'user',
            content: `Quiz Question: ${questionText}\n\nData (first 5 rows):\n${dataString.substring(0, 500)}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AIPIPE_TOKEN}`
        }
      }
    );

    const pythonCode = aipipeResponse.data.choices[0].message.content;

    // 4. Code Execution (External Sandbox)
    const codeExecutionResponse = await axios.post(
      process.env.CODE_EXECUTION_ENDPOINT!,
      {
        code: pythonCode,
        data: dataString
      }
    );

    const finalAnswer = codeExecutionResponse.data.final_answer;

    // 5. Submission & Looping
    const submissionPayload = {
      answer: finalAnswer,
      email: process.env.MY_EMAIL,
    };

    submissionResponse = await axios.post(submissionUrl, submissionPayload);

    if (submissionResponse.data.correct) {
      if (submissionResponse.data.url) {
        // Recursively call solveQuiz for the next stage
        return solveQuiz({ url: submissionResponse.data.url, secret: payload.secret });
      }
      // Quiz is complete
      return submissionResponse.data;
    } else {
      retries++;
      console.log(`Answer was incorrect. Retrying (${retries}/${maxRetries})...`);
    }
  }

  // If all retries fail, return the last response
  return submissionResponse?.data;
}
