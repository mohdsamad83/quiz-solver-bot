import { NextRequest, NextResponse } from 'next/server';
import playwright from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { solveWithAIPipe } from '../../../lib/aipipe';
import axios from 'axios';

// The interface for the initial API request
interface QuizRequest {
    email: string;
    secret: string;
    url: string;
}

// The interface for the quiz submission payload
interface SubmissionPayload {
    email: string;
    secret: string;
    url: string;
    answer: any;
}

/**
 * Handles POST requests to the /api/quiz route.
 * @param req The Next.js API request object.
 * @returns A JSON response with the result of the quiz.
 */
export async function POST(req: NextRequest) {
    try {
        const { email, secret, url }: QuizRequest = await req.json();

        // 1. Verify Secret
        if (secret !== process.env.MY_SECRET) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        let currentUrl = url;
        const results = [];

        // 2. Launch Browser
        const browser = await playwright.chromium.launch({
            args: process.env.NODE_ENV === 'production' ? chromium.args : [],
            executablePath: process.env.NODE_ENV === 'production' ? await chromium.executablePath() : undefined,
            headless: process.env.NODE_ENV === 'production' ? chromium.headless : true,
        });

        try {
            while (currentUrl) {
                const page = await browser.newPage();
                try {
                    // 3. Navigate
                    await page.goto(currentUrl, { waitUntil: 'networkidle' });

                    // 4. Scrape
                    const page_content = await page.evaluate(() => document.body.innerText);
                    // In a real scenario, you might have a more specific selector for the question
                    const question = "Extract the question from the page content and format it as requested.";

                    // 5. Solve
                    const answer = await solveWithAIPipe(page_content, question);

                    // 6. Submit
                    const submissionPayload: SubmissionPayload = {
                        email,
                        secret,
                        url: currentUrl,
                        answer,
                    };

                    // You might need to find the submission URL from the page
                    const submissionUrl = currentUrl; // Assuming submission is to the same URL

                    const submissionResponse = await axios.post(submissionUrl, submissionPayload);

                    results.push({
                        url: currentUrl,
                        answer,
                        response: submissionResponse.data,
                    });

                    // 7. Loop
                    currentUrl = submissionResponse.data.next_url; // Or whatever the response calls it
                } finally {
                    await page.close();
                }
            }
        } finally {
            await browser.close();
        }

        // 8. Response
        return NextResponse.json({
            message: 'Quiz completed successfully!',
            results,
        });

    } catch (error) {
        console.error('Error in quiz API route:', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
}
