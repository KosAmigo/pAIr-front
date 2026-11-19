package com.pair.exam.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/**
 * 대상자 엑셀(.xlsx) 읽기. 첫 행은 헤더이고 "이름"·"이메일" 열을 찾는다 (순서 상관없음, 영문 name/email 도 됨).
 * 검증(이메일 형식, 중복)은 여기서 하지 않고 줄 번호만 붙여 돌려준다.
 */
public final class ParticipantExcelParser {

    public record ExcelRow(int line, String name, String email) {}

    private static final DataFormatter FORMAT = new DataFormatter();

    private ParticipantExcelParser() {}

    public static List<ExcelRow> parse(InputStream in, int maxRows) {
        try (Workbook wb = new XSSFWorkbook(in)) {
            Sheet sheet = wb.getNumberOfSheets() == 0 ? null : wb.getSheetAt(0);
            if (sheet == null) throw new IllegalArgumentException("엑셀에 시트가 없습니다.");
            Row header = sheet.getRow(sheet.getFirstRowNum());
            int nameCol = findColumn(header, "이름", "name");
            int emailCol = findColumn(header, "이메일", "email");
            if (nameCol < 0 || emailCol < 0) throw new IllegalArgumentException("첫 행에 '이름', '이메일' 열이 있어야 합니다.");

            List<ExcelRow> rows = new ArrayList<>();
            for (int r = sheet.getFirstRowNum() + 1; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                String name = text(row, nameCol);
                String email = text(row, emailCol);
                if (name.isEmpty() && email.isEmpty()) continue; // 빈 줄
                if (rows.size() >= maxRows) throw new IllegalArgumentException("한 번에 " + maxRows + "명까지 올릴 수 있습니다.");
                rows.add(new ExcelRow(r + 1, name, email));
            }
            return rows;
        } catch (IOException | org.apache.poi.UnsupportedFileFormatException e) {
            throw new IllegalArgumentException("엑셀(.xlsx) 파일을 읽지 못했습니다.");
        }
    }

    private static int findColumn(Row header, String... names) {
        if (header == null) return -1;
        for (Cell c : header) {
            String v = FORMAT.formatCellValue(c).trim().toLowerCase();
            for (String n : names) if (v.equals(n)) return c.getColumnIndex();
        }
        return -1;
    }

    private static String text(Row row, int col) {
        if (row == null) return "";
        Cell c = row.getCell(col);
        return c == null ? "" : FORMAT.formatCellValue(c).trim();
    }
}
