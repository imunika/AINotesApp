import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { convertToModelMessages, streamText, tool, UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getAuthUserId } from "@convex-dev/auth/server";
import { z } from "zod";
import { internal } from "./_generated/api";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/api/chat",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages }: { messages: UIMessage[] } = await req.json();

    const lastMessages = messages.slice(-10);

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: `
        You are a helpful assistant that search through the user's notes.
        Use the information from the notes to answer questions and provide insights.
        If the requested information is not found in the notes, say "Sorry, I can't find that information in your notes".
        You can use markdown formatting like links, bullet points, numbered lists, and bold and italic text to format your responses.
        
        IMPORTANT: When you reference a note that was found in the search results, you MUST include a markdown link to that note.
        The link format must be exactly: [Note Title](/notes?noteId=<note-id>)
        Use the 'id' field from the note object as the note-id value in the URL.
        Always include these links when mentioning notes that were retrieved from the findRelevantNotes tool.
        
        Keep your responses concise and to the point.
        `,
      messages: convertToModelMessages(lastMessages),
      tools: {
        findRelevantNotes: tool({
          description:
            "Retrieve relevant notes from the database on the user's query",
          parameters: z.object({
            query: z.string().describe("The user's query"),
          }),
          execute: async ({ query }) => {
            console.log("findRelevantNotes query:", query);

            const relevantNotes = await ctx.runAction(
              internal.notesActions.findRelevantNotes,
              {
                query,
                userId,
              }
            );

            return relevantNotes.map((note) => ({
              id: note._id,
              title: note.title,
              body: note.body,
              createdAt: note._creationTime,
            }));
          },
        }),
      },
      onError(error) {
        console.error("StreamText error:", error);
      },
    });

    return result.toUIMessageStreamResponse({
      headers: new Headers({
        "Access-Control-Allow-Origin": "*",
        Vary: "Origin",
      }),
    });
  }),
});

http.route({
  path: "/api/chat",
  method: "OPTIONS",
  handler: httpAction(async (_, request) => {
    const headers = request.headers;
    if (
      headers.get("Origin") !== null &&
      headers.get("Access-Control-Request-Method") !== null &&
      headers.get("Access-Control-Request-Headers") !== null
    ) {
      return new Response(null, {
        headers: new Headers({
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Digest, Authorization",
          "Access-Control-Max-Age": "86400",
        }),
      });
    } else {
      return new Response();
    }
  }),
});

export default http;
