// Ambient type declarations for NestJS AST test fixture
declare class JwtAuthGuard {}
declare class User {
  id: string;
  email: string;
  orders: any[];
}
declare interface CreateOrderDto {
  code: string;
  amount: number;
}
declare const user: {
  hasPermission(permission: string): boolean;
  email: string;
};
