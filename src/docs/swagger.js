import swaggerJSDoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Plashcard API', version: '1.0.0' },
    servers: [{ url: 'http://localhost:5000' },{ url: 'https://flashcard-backend-749317853735.asia-southeast1.run.app' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  apis: ['./src/routes/*.js'],
});
