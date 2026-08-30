# Cổng tài khoản

## Mục tiêu

Cổng tài khoản cho phép người dùng hợp lệ đăng nhập và ngăn tài khoản đã vô hiệu tạo phiên mới

## Phạm vi

Tài liệu mô tả đăng nhập và vô hiệu tài khoản

## Vai trò

Người dùng đã đăng ký sử dụng email và mật khẩu để đăng nhập

Quản trị viên có quyền vô hiệu tài khoản người dùng

## Đăng nhập

Người dùng có tài khoản đang hoạt động có thể đăng nhập bằng email và mật khẩu

Hệ thống kiểm tra thông tin đăng nhập và trạng thái tài khoản trước khi tạo phiên xác thực

Thông tin đăng nhập không hợp lệ không tạo phiên và trả về lỗi xác thực

Chỉ tài khoản ở trạng thái Hoạt động được phép đăng nhập

## API đăng nhập

POST /login nhận email và password bắt buộc

API trả 200 và tạo phiên khi thông tin hợp lệ; API trả 401 và không tạo phiên khi thông tin không hợp lệ

## Vô hiệu tài khoản

Quản trị viên có thể vô hiệu tài khoản đang hoạt động

Hệ thống kiểm tra quyền quản trị viên, chuyển trạng thái tài khoản sang Đã vô hiệu và lưu thay đổi

Tài khoản đã vô hiệu không được tạo phiên đăng nhập mới

Tài liệu không quyết định hành vi của các phiên đã được tạo trước thời điểm vô hiệu

## Nhật ký

Khi trạng thái tài khoản thay đổi, hệ thống lưu ID người thao tác, trạng thái cũ, trạng thái mới và thời gian thay đổi
