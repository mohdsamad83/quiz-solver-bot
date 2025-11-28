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
  // This simplified architecture relies entirely on AIPipe for all reasoning,
  // calculation, and final answering. It removes the need for an external
  // code execution sandbox, making the application easier to maintain and deploy.

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
    // 3. Final LLM Prompt (AIPipe Only)
    const aipipeResponse = await axios.post(
      'https://api.aipipe.org/v1/chat/completions',
      {
        model: 'gpt-4', // Or another suitable model
        messages: [
          {
            role: 'system',
            content: "You are an ultimate, fully self-contained data analysis engine. Your task is to perform the required data sourcing, preparation, analysis, and visualization requested by the user. **You MUST return only the final, calculated answer.** If a visualization (chart) is required, you must return the correct **Python code** that generates the Matplotlib chart, followed by the specific base64 string that chart would produce if run. If the answer is a simple value (number, string, boolean), return only that value. **DO NOT include any explanation or extra text.**"
          },
          {
            role: 'user',
            content: `Quiz Question: ${questionText}\n\nSubmission URL: ${submissionUrl}\n\nData:\n${dataString}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AIPIPE_TOKEN}`
        }
      }
    );

    // 4. Result Parsing
    const finalAnswer = aipipeResponse.data.choices[0].message.content;

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
