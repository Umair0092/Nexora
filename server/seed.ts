import "dotenv/config";
import { db } from "./db";
import { domains, questions } from "@shared/schema";

const seedDomains = [
  {
    name: "Software Engineering",
    description: "Technical interviews for software development roles including algorithms, system design, and coding practices",
    icon: "Code",
    questionCount: 10,
  },
  {
    name: "Product Management",
    description: "Product strategy, roadmap planning, stakeholder management, and product development lifecycle",
    icon: "Briefcase",
    questionCount: 10,
  },
  {
    name: "Data Science",
    description: "Machine learning, statistical analysis, data visualization, and problem-solving with data",
    icon: "BarChart3",
    questionCount: 10,
  },
  {
    name: "Marketing",
    description: "Digital marketing, brand strategy, campaign management, and market analysis",
    icon: "Megaphone",
    questionCount: 10,
  },
  {
    name: "Finance",
    description: "Financial analysis, investment strategies, risk management, and corporate finance",
    icon: "DollarSign",
    questionCount: 10,
  },
  {
    name: "Human Resources",
    description: "Talent acquisition, employee relations, organizational development, and HR policies",
    icon: "Users",
    questionCount: 10,
  },
];

const seedQuestions = {
  "Software Engineering": {
    beginner: [
      "Tell me about yourself and your background in software development.",
      "What programming languages are you most comfortable with and why?",
      "Can you explain the difference between an array and a linked list?",
      "How do you approach debugging a piece of code that isn't working?",
    ],
    intermediate: [
      "Describe a challenging technical problem you solved. What was your approach?",
      "How would you design a URL shortening service like bit.ly?",
      "Explain the concept of RESTful APIs and their best practices.",
      "What is your experience with version control systems, specifically Git?",
    ],
    advanced: [
      "Design a distributed caching system. What trade-offs would you consider?",
      "How would you architect a real-time collaboration tool like Google Docs?",
      "Explain the CAP theorem and its implications for system design.",
      "Describe your experience with microservices architecture and its challenges.",
    ],
  },
  "Product Management": {
    beginner: [
      "What attracted you to product management as a career?",
      "How do you prioritize features when building a product roadmap?",
      "Tell me about a product you love and what makes it great.",
      "How do you gather and incorporate user feedback?",
    ],
    intermediate: [
      "Describe a time when you had to make a difficult product decision with limited data.",
      "How do you measure the success of a product feature?",
      "Walk me through how you would launch a new product in a competitive market.",
      "How do you handle conflicting priorities from different stakeholders?",
    ],
    advanced: [
      "How would you turn around a failing product with declining user engagement?",
      "Describe your approach to building and leading a product team.",
      "How do you balance technical debt with new feature development?",
      "Walk me through a complex product strategy you developed and executed.",
    ],
  },
  "Data Science": {
    beginner: [
      "What drew you to data science as a field?",
      "Explain the difference between supervised and unsupervised learning.",
      "What tools and programming languages do you use for data analysis?",
      "How do you handle missing data in a dataset?",
    ],
    intermediate: [
      "Describe a machine learning project you worked on from start to finish.",
      "How do you evaluate the performance of a classification model?",
      "Explain the bias-variance tradeoff and how it affects model selection.",
      "How do you communicate complex findings to non-technical stakeholders?",
    ],
    advanced: [
      "How would you build a recommendation system for an e-commerce platform?",
      "Describe your experience with deep learning and neural networks.",
      "How do you ensure your models are fair and unbiased?",
      "Walk me through how you would design an A/B testing framework.",
    ],
  },
  "Marketing": {
    beginner: [
      "What interests you about marketing as a career?",
      "How do you stay current with marketing trends and best practices?",
      "Tell me about a marketing campaign that impressed you.",
      "What social media platforms are you most experienced with?",
    ],
    intermediate: [
      "Describe a successful marketing campaign you led or contributed to.",
      "How do you measure the ROI of marketing initiatives?",
      "What is your experience with marketing automation tools?",
      "How do you approach creating a content marketing strategy?",
    ],
    advanced: [
      "How would you develop a go-to-market strategy for a new product?",
      "Describe your experience with brand repositioning or rebranding.",
      "How do you integrate data analytics into marketing decision-making?",
      "Walk me through how you would handle a PR crisis.",
    ],
  },
  "Finance": {
    beginner: [
      "Why are you interested in a career in finance?",
      "Explain the three main financial statements and their purposes.",
      "What is the time value of money and why is it important?",
      "How do you stay informed about market trends and economic news?",
    ],
    intermediate: [
      "Walk me through a DCF valuation model.",
      "How do you assess the financial health of a company?",
      "Describe your experience with financial modeling and forecasting.",
      "What factors do you consider when evaluating an investment opportunity?",
    ],
    advanced: [
      "How would you structure a complex M&A transaction?",
      "Describe your approach to risk management in a portfolio.",
      "What is your experience with derivatives and hedging strategies?",
      "Walk me through a challenging financial analysis you conducted.",
    ],
  },
  "Human Resources": {
    beginner: [
      "What attracted you to a career in human resources?",
      "How do you ensure a positive candidate experience during recruitment?",
      "What do you consider the most important qualities in an HR professional?",
      "How do you stay current with employment laws and regulations?",
    ],
    intermediate: [
      "Describe your experience with performance management systems.",
      "How do you handle a conflict between employees?",
      "What strategies do you use to improve employee retention?",
      "Tell me about a successful initiative you led to improve company culture.",
    ],
    advanced: [
      "How would you develop a comprehensive talent management strategy?",
      "Describe your experience leading organizational change initiatives.",
      "How do you measure and improve employee engagement?",
      "Walk me through how you would handle a workforce reduction.",
    ],
  },
};

async function seed() {
  console.log("Seeding database...");

  for (const domainData of seedDomains) {
    const [domain] = await db.insert(domains).values(domainData).returning();
    console.log(`Created domain: ${domain.name}`);

    const domainQuestions = seedQuestions[domainData.name as keyof typeof seedQuestions];
    if (domainQuestions) {
      for (const [difficulty, qs] of Object.entries(domainQuestions)) {
        for (const questionText of qs) {
          await db.insert(questions).values({
            domainId: domain.id,
            text: questionText,
            difficulty,
            language: "en",
          });
        }
      }
      console.log(`  Added questions for ${domainData.name}`);
    }
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
