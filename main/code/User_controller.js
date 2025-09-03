import { asyncHandler } from "../noController/utils/asyncHandler.js";
import { ApiError } from "../noController/utils/ApiError.js";
import { User } from "../noController/models/user.model.js";
import { ApiResponse } from "../noController/utils/ApiResponse.js";
import jwt from 'jsonwebtoken'
import { verifyJWT } from "../noController/middlewares/auth.middleware.js";

const generateAccessAndRefereshTokens = async(userId)=>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false})

        return {accessToken,refreshToken}
    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating tokens")
    }
}


const registerUser = asyncHandler(async(req,res)=>{
      const{username,fullName,email,password} = req.body
      console.log("email",email)

       // Validate all fields
    if (!fullName || !email || !username || !password) {
        throw new ApiError(400, "All fields are required");
    }
   
      const existedUser = await User.findOne({
        $or : [{username},{email}]
    })

    if(existedUser){
        throw new ApiError(400,"User with email or username already exists")
    }

    const user = await User.create({
        fullName,
        email,
        password,
        username,
        role: "user"
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(400,"Something went wrong while registering user")
    }

    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
    )

    
})

const loginUser = asyncHandler(async(req,res)=>{
    const{email,password,username} = req.body

    if(!(username ||email)){
        throw new ApiError(400,"username or email is required")
    }

    const user = await User.findOne({
        $or: [{username},{email}]
    })

    if(!user){
        throw new ApiError(404,"user not found")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401,"Password incorrect")
    }
    
    const {accessToken,refreshToken} = await generateAccessAndRefereshTokens(user._id)
    
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    const options = {
        httpOnly :true,
        secure:true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken,options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser,accessToken,refreshToken
            },
            "User logged in successfully"
        )
    )
})

const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken:undefined
            }
        },
        {
            new:true
        }
    )

    const options = {
        httpOnly : true,
        secure:true
    }

    return res
    .status(200)
    .clearCookie("accessToken",options)
    .clearCookie("refreshToken",options)
    .json(
        new ApiResponse(200,{},"User logged Out")
    )
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingToken){
        throw new ApiError(401,"Unauthorized access")
    }
    try {
        const decodedToken = jwt.verify(
            incomingToken,
            process.env.REFRESH_TOKEN_SECRET
        )

        const user = await User.findById(decodedToken._id)

        if(!user){
            throw new ApiError(401,"Invalid refresh Token")
        }
        if(incomingToken !== user?.refreshToken){
            throw new ApiError(401,"Refresh token in invalid")
        }

        const options = {
            httpOnly:true,
            secure: true
        }
        const{accessToken,refreshToken:newRefreshToken} = await generateAccessAndRefereshTokens(user._id)

        return res.
        status(200)
        .cookie("accessToken",accessToken,options)
        .cookie("refreshToken",newRefreshToken,options)
         .json(
            new ApiResponse(
                200,
                {accessToken,refreshToken:newRefreshToken},
                "Access token refreshed"
            )
         )
    } catch (error) {
        throw new ApiError(401,error?.message)
    }
})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const{oldPassword,newPassword} = req.body

    const user = await User.findById(req.user?._id)

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400,"Invalid password")
    }

    user.password = newPassword

    await user.save({validateBeforeSave:false})
     return res.status(200)
    .json(new ApiResponse(200,{},"Passsword changed "))
})

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res.status(200)
    .json(new ApiResponse(200,req.user,"current user fetched"))
})
export{
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser
}
