namespace PNX {

// START KEVIN CAA WIZARD SECTION PNXWidgetItem PARAM DECLARATION

// clang-format off

// @app Kt Auto Code
// @version 5.0.0, (2024)

/**
 * @brief Widget Name
 * @author Manual QA
 * @date 2026-07-16
 * @note Root-level discovery fixture
 * @id 1
 */
CATUnicodeString WidgetName;

/**
 * @brief Widget Count
 * @author Manual QA
 * @date 2026-07-16
 * @note Edit, duplicate and sort this row
 * @id 2
 */
int WidgetCount;

/**
 * @brief Widget Length
 * @author Manual QA
 * @date 2026-07-16
 * @note Theme and horizontal scroll fixture
 * @id 3
 */
double WidgetLength;

// clang-format on
// END KEVIN CAA WIZARD SECTION PNXWidgetItem PARAM DECLARATION

// START KEVIN CAA WIZARD SECTION PNXWidgetItem QT UPDATE DIALOG

// clang-format off

// 1, WidgetName, Root-level discovery fixture
dialogMore->lineEditWidgetName->setText( parameter->WidgetName);

// 2, WidgetCount, Edit, duplicate and sort this row
dialogMore->spinBoxWidgetCount->setValue(parameter->WidgetCount);

// 3, WidgetLength, Theme and horizontal scroll fixture
dialogMore->doubleSpinBoxWidgetLength->setValue(parameter->WidgetLength);

// clang-format on
// END KEVIN CAA WIZARD SECTION PNXWidgetItem QT UPDATE DIALOG

} // namespace PNX
