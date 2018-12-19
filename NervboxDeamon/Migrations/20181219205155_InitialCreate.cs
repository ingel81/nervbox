using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace NervboxDeamon.Migrations
{
    public partial class InitialCreate : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "records",
                columns: table => new
                {
                    time = table.Column<DateTime>(nullable: false),
                    cur = table.Column<double>(nullable: false),
                    acc = table.Column<double>(nullable: false),
                    temp_1 = table.Column<double>(nullable: false),
                    temp_2 = table.Column<double>(nullable: false),
                    temp_3 = table.Column<double>(nullable: false),
                    temp_b = table.Column<double>(nullable: false),
                    cycl = table.Column<long>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_records", x => x.time);
                });

            migrationBuilder.CreateTable(
                name: "settings",
                columns: table => new
                {
                    Key = table.Column<string>(nullable: false),
                    Description = table.Column<string>(nullable: false),
                    SettingType = table.Column<string>(maxLength: 50, nullable: false),
                    SettingScope = table.Column<string>(maxLength: 50, nullable: false),
                    Value = table.Column<string>(nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_settings", x => x.Key);
                });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "records");

            migrationBuilder.DropTable(
                name: "settings");
        }
    }
}
