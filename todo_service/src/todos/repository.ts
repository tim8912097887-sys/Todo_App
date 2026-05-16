import { logger } from '#configs/logger.js';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateTodo } from './schema/create.js';
import { UpdateTodo } from './schema/update.js';
import { todos } from '#db/schema/todo.js';
import { TodoDto } from './dto.js';
import { and, desc, eq, isNull } from 'drizzle-orm';

export class TodoRepository {
    protected readonly logger = logger;
    constructor(protected readonly db: NodePgDatabase) {}

    async create(data: CreateTodo): Promise<TodoDto> {
        const [todo] = await this.db.insert(todos).values(data).returning({
            id: todos.id,
            title: todos.title,
            description: todos.description,
            completed: todos.completed,
            createdAt: todos.createdAt,
        });
        return todo;
    }

    async update(id: string, data: UpdateTodo): Promise<TodoDto | null> {
        const result = await this.db
            .update(todos)
            .set(data)
            .where(and(eq(todos.id, id), isNull(todos.deletedAt)))
            .returning({
                id: todos.id,
                title: todos.title,
                description: todos.description,
                completed: todos.completed,
                createdAt: todos.createdAt,
            });
        // Return null if not found
        if (result.length === 0) return null;

        const [todo] = result;
        return todo;
    }

    async delete(id: string): Promise<number | null> {
        const todo = await this.findById(id);
        if (!todo) return null;
        const result = await this.db
            .update(todos)
            .set({ deletedAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })
            .where(eq(todos.id, id));
        if (!result) return null;
        return 1;
    }

    async findById(id: string): Promise<TodoDto | null> {
        const [todo] = await this.db
            .select({
                id: todos.id,
                title: todos.title,
                description: todos.description,
                completed: todos.completed,
                createdAt: todos.createdAt,
            })
            .from(todos)
            .where(and(eq(todos.id, id), isNull(todos.deletedAt)));
        return todo;
    }

    async findAllComplete(): Promise<TodoDto[]> {
        const todosArray = await this.db
            .select({
                id: todos.id,
                title: todos.title,
                description: todos.description,
                completed: todos.completed,
                createdAt: todos.createdAt,
            })
            .from(todos)
            .where(and(eq(todos.completed, true), isNull(todos.deletedAt)))
            .orderBy(desc(todos.createdAt));
        return todosArray;
    }

    async findAllNotComplete(): Promise<TodoDto[]> {
        const todosArray = await this.db
            .select({
                id: todos.id,
                title: todos.title,
                description: todos.description,
                completed: todos.completed,
                createdAt: todos.createdAt,
            })
            .from(todos)
            .where(and(eq(todos.completed, false), isNull(todos.deletedAt)))
            .orderBy(desc(todos.createdAt));
        return todosArray;
    }
}
