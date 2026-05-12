import { IUser } from '#types/index.js';

export class UserDto {
    id!: string;
    email!: string;
    username!: string;

    constructor(partial: Partial<IUser>) {
        Object.assign(this, partial);
    }

    static fromEntity(entity: any): UserDto {
        return new UserDto({
            id: entity.id,
            email: entity.email,
            username: entity.username,
        });
    }
}
