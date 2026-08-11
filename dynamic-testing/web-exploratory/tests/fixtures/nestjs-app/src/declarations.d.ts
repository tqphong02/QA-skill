// Ambient TypeScript module declarations for NestJS AST Test Fixture
declare module '@nestjs/common' {
  export function Controller(path?: string): any;
  export function Get(path?: string): any;
  export function Post(path?: string): any;
  export function Put(path?: string): any;
  export function Delete(path?: string): any;
  export function Patch(path?: string): any;
  export function Param(param?: string): any;
  export function Body(): any;
  export function UseGuards(...guards: any[]): any;
  export function SetMetadata(key: any, value: any): any;
  export function Injectable(): any;
  export function Roles(...roles: string[]): any;
  export class NotFoundException extends Error {}
  export class ConflictException extends Error {}
  export class ForbiddenException extends Error {}
}

declare module 'typeorm' {
  export function Entity(name?: string): any;
  export function PrimaryGeneratedColumn(type?: string): any;
  export function Column(type?: any, options?: any): any;
  export function CreateDateColumn(): any;
  export function ManyToOne(typeFunction?: any, inverseSide?: any): any;
}

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
